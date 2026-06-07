import { Mentor } from '@/lib/db/schema';

// Improved DiffField component
const DiffField = ({ label, oldValue, newValue }: { label: string; oldValue: any; newValue: any }) => {
  const hasChanged = JSON.stringify(oldValue) !== JSON.stringify(newValue);

  // Normalize values for display
  const displayOld = Array.isArray(oldValue) ? oldValue.join(', ') : oldValue;
  const displayNew = Array.isArray(newValue) ? newValue.join(', ') : newValue;

  return (
    <div className={`py-3 sm:grid sm:grid-cols-3 sm:gap-4 ${hasChanged ? 'bg-yellow-50 rounded-lg px-3' : 'px-3'}`}>
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
        {hasChanged ? (
          <>
            <span className="text-red-500 line-through">{displayOld || 'Not provided'}</span>
            <span className="text-green-600 ml-2 font-semibold">{displayNew || 'Not provided'}</span>
          </>
        ) : (
          <span>{displayNew || 'Not provided'}</span>
        )}
      </dd>
    </div>
  );
};

// Main component with sections
export function MentorAuditView({
  previousData,
  updatedData,
}: {
  previousData: Partial<Mentor>;
  updatedData: Partial<Mentor>;
}) {
  const personalFields: (keyof Mentor)[] = ['fullName', 'email', 'phone', 'city', 'state', 'country'];
  const professionalFields: (keyof Mentor)[] = ['title', 'company', 'industry', 'headline', 'about', 'experience', 'expertise', 'hourlyRate'];
  const socialFields: (keyof Mentor)[] = ['linkedinUrl', 'githubUrl', 'websiteUrl'];

  const allFields = {
    fullName: 'Full Name',
    email: 'Email',
    phone: 'Phone',
    city: 'City',
    state: 'State',
    country: 'Country',
    title: 'Job Title',
    company: 'Company',
    industry: 'Industry',
    headline: 'Headline',
    about: 'About',
    experience: 'Experience (Years)',
    expertise: 'Expertise',
    hourlyRate: 'Hourly Rate',
    linkedinUrl: 'LinkedIn URL',
    githubUrl: 'GitHub URL',
    websiteUrl: 'Website URL',
  };

  const renderSection = (title: string, keys: (keyof Mentor)[]) => (
    <div>
      <h3 className="text-lg leading-6 font-medium text-gray-900">{title}</h3>
      <div className="mt-2 border-t border-gray-200">
        <dl className="divide-y divide-gray-200">
          {keys.map((key) => (
            <DiffField
              key={key}
              label={allFields[key]}
              oldValue={previousData[key]}
              newValue={updatedData[key]}
            />
          ))}
        </dl>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {renderSection('Personal Information', personalFields)}
      {renderSection('Professional Details', professionalFields)}
      {renderSection('Social Links', socialFields)}
    </div>
  );
}
