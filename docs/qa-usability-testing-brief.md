# Young Minds QA Usability Testing Brief

## Goal

Please use the app like a real user and intentionally look for anything confusing, broken, slow, inconsistent, ugly, misleading, or hard to understand.

We are not only testing whether things technically work. We are testing whether the app feels production-ready.

## Test Accounts

### Mentor

Email: `qa.mentor@youngminds.test`

Password: `QA-Mentor-2026-807f738f-466121!`

Expected account state:

- The user should be able to sign in with email and password.
- The account should have the `mentor` role.
- The mentor should be verified.
- The mentor should not see verification-blocked experiences that apply only to pending or unverified mentors.

### Mentee

Email: `qa.mentee@youngminds.test`

Password: `QA-Mentee-2026-e9f6eb56-d762ec!`

Expected account state:

- The user should be able to sign in with email and password.
- The account should have the `mentee` role.
- The user should be able to test mentee-facing discovery, profile, dashboard, booking, and messaging flows where available.

## Main Testing Areas

### Authentication

- Sign in with the mentor account.
- Sign in with the mentee account.
- Sign out from both accounts.
- Try signing in with a wrong password.
- Refresh the page after login.
- Open protected pages while signed out.
- Check whether redirects make sense after login and logout.
- Check whether error messages are clear and useful.

### Mentee Experience

- Browse mentors.
- Search or filter mentors if available.
- Open mentor profiles.
- Review mentor profile layout, banner, avatar, name, status, and content.
- Try booking or requesting sessions if available.
- Try messaging if available.
- Check the mentee dashboard.
- Check empty states.
- Check mobile usability.
- Check whether unavailable or restricted actions explain what is happening.

### Mentor Experience

- Open the mentor dashboard.
- Check the sidebar and verified mentor status.
- Review the dashboard layout and whether important information is easy to understand.
- Update profile fields if the UI allows it.
- Upload or change profile image and banner if the UI allows it.
- Check whether the profile image, name, and banner are visually aligned.
- Check availability or session-related pages.
- Check messaging if available.
- Check whether restricted or gated actions are visually clear.
- Check whether the mentor experience still works after refresh and navigation.

### Usability And Design

- Look for anything that feels unprofessional, confusing, cramped, misaligned, or inconsistent.
- Check whether important labels and statuses are easy to understand.
- Check whether any page has too much text or not enough explanation.
- Check whether buttons clearly say what they do.
- Check whether forms are easy to complete.
- Check whether loading, error, and empty states feel polished.
- Check whether the app respects dark mode.
- Check whether the UI requires too much scrolling.
- Check whether tooltip text is useful and readable.
- Check whether the app feels slow, stuck, or jumpy.

### Edge Cases

- Refresh during forms.
- Use browser back and forward buttons.
- Open pages in multiple tabs.
- Try very long names or text where forms allow input.
- Try submitting empty fields.
- Try invalid email/password input.
- Try uploading images if available.
- Test mobile screen sizes.
- Test narrow browser widths.
- Test dark mode and light mode.

## Do Not Do

- Do not use real personal information.
- Do not enter real payment information.
- Do not run stress tests or load tests.
- Do not attempt destructive security attacks.
- Do not delete anything unless the UI clearly allows it and it is test data.
- Do not share these credentials outside the QA/testing context.

## What Counts As A Good Finding

A useful finding can be technical, visual, or behavioral.

Examples:

- A button does nothing.
- A page crashes or shows an error.
- A redirect goes to the wrong place.
- A message is confusing.
- A status label is unclear.
- A layout breaks on mobile.
- Dark mode has unreadable text.
- A form accepts bad data.
- A form rejects valid data.
- A restricted action does not explain why it is restricted.
- A page technically works but feels unpolished.

## Bug Report Format

For every issue, please report the following:

### Title

Short description of the problem.

### Severity

Use one of:

- Critical: The app or a major flow is unusable.
- High: A key flow is broken or very confusing.
- Medium: The issue affects usability but has a workaround.
- Low: Minor issue, inconsistency, or polish problem.
- Polish: Visual, wording, spacing, or quality improvement.

### Account Used

Mentor or mentee.

### Steps To Reproduce

1. First step.
2. Second step.
3. Third step.

### Expected Result

What should have happened?

### Actual Result

What actually happened?

### Screenshot Or Screen Recording

Attach a screenshot or recording if possible.

### Notes

Anything confusing, suspicious, or hard to explain.

## Recommended Testing Method

Please screen-record the session if possible. While testing, say out loud what you expected to happen and what confused you.

For usability testing, feedback like "I did not understand what this means" or "I expected this button to do something else" is very valuable.

