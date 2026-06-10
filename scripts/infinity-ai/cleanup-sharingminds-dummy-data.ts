import { client } from '../../lib/db';

const SEED_BATCH = 'sharingminds_dummy_seed_v1';
const USER_PREFIX = 'seed-sharingminds-';
const EMAIL_DOMAIN = 'sharingminds-dummy.local';

function parseArgs() {
  const args = new Map<string, string | boolean>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    const [key, value] = raw.slice(2).split('=');
    args.set(key, value ?? true);
  }

  return {
    execute: args.get('execute') === true || args.get('execute') === 'true',
  };
}

async function countRows() {
  const [counts] = await client`
    select
      (select count(*)::int from users where id like ${USER_PREFIX + '%'} or email like ${'%' + EMAIL_DOMAIN}) as users,
      (select count(*)::int from mentor_content where review_note like ${SEED_BATCH + '%'}) as content,
      (select count(*)::int from ai_recommendation_events where metadata->>'seedBatch' = ${SEED_BATCH}) as recommendation_events,
      (select count(*)::int from ai_admin_boost_rules where reason like ${SEED_BATCH + '%'}) as boost_rules,
      (select count(*)::int from subscription_plans where plan_key like 'sharingminds_dummy_%') as plans
  `;

  return counts;
}

async function cleanup() {
  await client.begin(async (tx) => {
    await tx`delete from ai_recommendation_events where metadata->>'seedBatch' = ${SEED_BATCH}`;
    await tx`delete from ai_admin_boost_rules where reason like ${SEED_BATCH + '%'}`;

    // Platform-owned content does not cascade through mentors, so delete it explicitly.
    await tx`delete from mentor_content where review_note like ${SEED_BATCH + '%'}`;

    // Users cascade into mentors, subscriptions, sessions, reviews, and mentor-owned content.
    await tx`delete from users where id like ${USER_PREFIX + '%'} or email like ${'%' + EMAIL_DOMAIN}`;

    // Seed plans are not attached to real users. Plan features/prices cascade from plans.
    await tx`delete from subscription_plans where plan_key like 'sharingminds_dummy_%'`;
  });
}

async function main() {
  const options = parseArgs();
  const before = await countRows();
  console.log('[sharingminds-cleanup] matching rows before cleanup:', before);

  if (!options.execute) {
    console.log('[sharingminds-cleanup] dry run only. Add --execute and INFINITY_AI_ALLOW_DUMMY_SEED=true to delete.');
    return;
  }

  if (process.env.INFINITY_AI_ALLOW_DUMMY_SEED !== 'true') {
    throw new Error('Refusing to cleanup dummy data unless INFINITY_AI_ALLOW_DUMMY_SEED=true is set.');
  }

  if (process.env.NODE_ENV === 'production' && process.env.INFINITY_AI_ALLOW_PRODUCTION_DUMMY_SEED !== 'true') {
    throw new Error('Refusing to cleanup dummy data in NODE_ENV=production.');
  }

  await cleanup();
  const after = await countRows();
  console.log('[sharingminds-cleanup] matching rows after cleanup:', after);
}

main()
  .catch((error) => {
    console.error('[sharingminds-cleanup] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
