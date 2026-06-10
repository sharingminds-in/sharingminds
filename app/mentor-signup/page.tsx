"use client";
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { useSubmitMentorApplicationMutation } from '@/hooks/queries/use-mentor-queries';
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/providers/theme-toggle";
import { ArrowLeft } from "lucide-react";

// Simplified Header Component for Mentor Signup
function MentorSignupHeader() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check if user is logged in on component mount
  useEffect(() => {
    const loggedIn = localStorage.getItem("isLoggedIn") === "true";
    setIsLoggedIn(loggedIn);
  }, []);

  const handleAuthClick = () => {
    if (isLoggedIn) {
      localStorage.removeItem("isLoggedIn");
      localStorage.removeItem("userEmail");
      setIsLoggedIn(false);
    } else {
      router.push("/auth");
    }
  };

  const handleLogoClick = () => {
    router.push("/");
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-sm border-b border-gray-200 dark:border-gray-800 h-16 flex items-center justify-between px-6">
      <div 
        className="text-lg font-bold cursor-pointer transition-colors"
        onClick={handleLogoClick}
      >
        Young<span className="text-blue-500">Minds</span>
      </div>
      
      <div className="flex items-center space-x-4">
        <ThemeToggle />
        <Button variant="outline" size="sm" onClick={handleAuthClick}>
          {isLoggedIn ? 'Logout' : 'Login'}
        </Button>
      </div>
    </header>
  );
}

export default function MentorSignup() {
  const router = useRouter();
  const { data: session } = useSession();
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [resume, setResume] = useState<File | null>(null);
  const [resumeError, setResumeError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const submitMentorApplicationMutation = useSubmitMentorApplicationMutation();

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPhoto(e.target.files[0]);
      setPhotoError('');
    }
  };

  const handleResumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      const allowedExtensions = ['pdf', 'doc', 'docx'];
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      
      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension || '')) {
        setResumeError('Please upload a PDF, DOC, or DOCX file');
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setResumeError('Resume file size must be less than 10MB');
        return;
      }
      
      setResume(file);
      setResumeError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) {
      setPhotoError('Photo is required.');
      return;
    }

    if (!resume) {
      setResumeError('Resume is required.');
      return;
    }

    if (!session?.user?.id) {
      alert('Please log in to submit your application');
      return;
    }

    setSubmitted(true);

    try {
      const formData = new FormData(e.target as HTMLFormElement);
      
      // Add additional data to FormData
      formData.append('userId', session.user.id);
      formData.append('profilePicture', photo);
      formData.append('resume', resume);
      formData.append('currency', 'USD');
      formData.append('hourlyRate', formData.get('hourlyRate') as string || '50.00');
      formData.append('headline', `${formData.get('currentTitle')} at ${formData.get('company')}`);
      formData.append('about', `Experienced ${formData.get('currentTitle')} with ${formData.get('experienceYears')} years in ${formData.get('industry')}. Specializing in ${formData.get('expertiseAreas')}.`);
      formData.append('isAvailable', 'true');

      console.log('🚀 Submitting mentor application with files');

      // Submit mentor application
      const result = await submitMentorApplicationMutation.mutateAsync(formData);
      console.log('📋 Mentor application result:', result);

      console.log('✅ Mentor application submitted successfully!');
      // Success - profile created and mentor role assigned
      
    } catch (error) {
      console.error('❌ Network/JS Error submitting mentor application:', error);
      alert(
        error instanceof Error
          ? error.message
          : 'Failed to submit application. Please check console for details.'
      );
      setSubmitted(false);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-10 max-w-md w-full flex flex-col items-center">
          <h2 className="text-2xl font-bold text-blue-600 mb-4 text-center">Application Submitted!</h2>
          <p className="text-gray-700 dark:text-gray-200 text-lg text-center mb-6">Your mentor profile is under review. You'll receive an update within 24 hours.</p>
          <button
            className="mt-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
            onClick={() => router.push('/dashboard')}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <MentorSignupHeader />
      
      <div className="pt-20 pb-10 px-2">
        <div className="max-w-lg mx-auto">
          {/* Back to Home Button */}
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => router.push('/')}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </div>

          <div className="register-container bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl w-full">
            <div className="header text-center mb-8">
              <h1 className="text-3xl font-bold text-blue-700 mb-2">Become a Mentor</h1>
              <p className="text-gray-500 dark:text-gray-300 text-base">Join our community and guide aspiring individuals towards their goals. Fill out this quick form to get started!</p>
            </div>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
              <div className="form-group">
                <label htmlFor="photo" className="block font-semibold mb-2 text-gray-700 dark:text-gray-200">Profile Photo <span className="text-red-500">*</span></label>
                <input
                  type="file"
                  id="photo"
                  name="photo"
                  accept="image/*"
                  required
                  onChange={handlePhotoChange}
                  className="block w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {photoError && <p className="text-red-500 text-xs mt-1">{photoError}</p>}
              </div>
              <div className="form-group">
                <label htmlFor="resume" className="block font-semibold mb-2 text-gray-700 dark:text-gray-200">Resume <span className="text-red-500">*</span></label>
                <input
                  type="file"
                  id="resume"
                  name="resume"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  required
                  onChange={handleResumeChange}
                  className="block w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {resumeError && <p className="text-red-500 text-xs mt-1">{resumeError}</p>}
                <p className="text-gray-500 text-xs mt-1">Upload your resume in PDF, DOC, or DOCX format (max 10MB)</p>
              </div>
              <div className="form-group">
                <label htmlFor="fullName" className="block font-semibold mb-2 text-gray-700 dark:text-gray-200">Full Name <span className="text-red-500">*</span></label>
                <input type="text" id="fullName" name="fullName" required placeholder="Your Name" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="form-group">
                <label htmlFor="email" className="block font-semibold mb-2 text-gray-700 dark:text-gray-200">Email Address <span className="text-red-500">*</span></label>
                <input type="email" id="email" name="email" required placeholder="you@example.com" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="form-group">
                <label htmlFor="phone" className="block font-semibold mb-2 text-gray-700 dark:text-gray-200">Phone Number <span className="text-red-500">*</span></label>
                <input type="tel" id="phone" name="phone" required pattern="^\+91-\d{10}$" title="Format: +91-XXXXXXXXXX" placeholder="+91-XXXXXXXXXX" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="form-group">
                <label htmlFor="currentTitle" className="block font-semibold mb-2 text-gray-700 dark:text-gray-200">Current Job Title <span className="text-red-500">*</span></label>
                <input type="text" id="currentTitle" name="currentTitle" required placeholder="e.g., Senior Software Engineer" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="form-group">
                <label htmlFor="company" className="block font-semibold mb-2 text-gray-700 dark:text-gray-200">Current Company/Organization <span className="text-red-500">*</span></label>
                <input type="text" id="company" name="company" required placeholder="Your Company Name" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="form-group grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="state" className="block font-semibold mb-2 text-gray-700 dark:text-gray-200">State <span className="text-red-500">*</span></label>
                  <input type="text" id="state" name="state" required placeholder="State" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label htmlFor="city" className="block font-semibold mb-2 text-gray-700 dark:text-gray-200">City <span className="text-red-500">*</span></label>
                  <input type="text" id="city" name="city" required placeholder="City" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="industry" className="block font-semibold mb-2 text-gray-700 dark:text-gray-200">Primary Industry <span className="text-red-500">*</span></label>
                <select id="industry" name="industry" required className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">Select your industry...</option>
                  <option value="ITSoftware">IT & Software</option>
                  <option value="Marketing">Marketing & Advertising</option>
                  <option value="Finance">Finance & Banking</option>
                  <option value="Education">Education</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Entrepreneurship">Entrepreneurship & Startup</option>
                  <option value="Design">Design (UI/UX, Graphic)</option>
                  <option value="Sales">Sales</option>
                  <option value="HR">Human Resources</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="experienceYears" className="block font-semibold mb-2 text-gray-700 dark:text-gray-200">Years of Professional Experience <span className="text-red-500">*</span></label>
                <div className="flex items-center gap-2">
                  <input type="number" id="experienceYears" name="experienceYears" min={2} required placeholder="e.g., 5" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <span className="tooltip relative cursor-help text-gray-400 text-xs">
                    &#9432;
                    <span className="tooltiptext absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 bg-gray-700 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      Minimum 2 years of experience required to be a mentor.
                    </span>
                  </span>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="expertiseAreas" className="block font-semibold mb-2 text-gray-700 dark:text-gray-200">Areas of Expertise <span className="text-red-500">*</span></label>
                <div className="flex items-center gap-2">
                  <textarea id="expertiseAreas" name="expertiseAreas" required placeholder="List skills you can mentor in (e.g., Python, Digital Marketing, Leadership, Career Transitions)" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 min-h-[80px] resize-vertical" />
                  <span className="tooltip relative cursor-help text-gray-400 text-xs">
                    &#9432;
                    <span className="tooltiptext absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 bg-gray-700 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      Be specific! This helps mentees find you. Use commas to separate multiple areas.
                    </span>
                  </span>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="availability" className="block font-semibold mb-2 text-gray-700 dark:text-gray-200">Preferred Mentorship Availability <span className="text-red-500">*</span></label>
                <select id="availability" name="availability" required className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">Select...</option>
                  <option value="Weekly">Weekly (e.g., 1 hour/week)</option>
                  <option value="BiWeekly">Bi-weekly (e.g., 1 hour/bi-week)</option>
                  <option value="Monthly">Monthly (e.g., 1 hour/month)</option>
                  <option value="AsNeeded">As needed (flexible)</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="linkedinUrl" className="block font-semibold mb-2 text-gray-700 dark:text-gray-200">LinkedIn Profile URL (Optional)</label>
                <input type="text" id="linkedinUrl" name="linkedinUrl" placeholder="https://linkedin.com/in/yourprofile" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <button type="submit" className="button-primary w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-lg transition">Register as Mentor</button>
              <div className="login-link text-center mt-4 text-sm text-gray-500">
                Already have an account?{' '}
                <a href="/auth" className="text-blue-600 hover:underline font-semibold">Login here</a>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
} 
