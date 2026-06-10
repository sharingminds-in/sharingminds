// src/app/reviews-demo/page.tsx
"use client"

import { SessionRating } from "@/components/booking/SessionRating"; // Adjust the import path to where you saved the component
import { useRouter } from 'next/navigation';

// This is the actual page component that Next.js will render.
// Notice the 'export default'.
export default function ReviewDemoPage() {
  const router = useRouter();

  // --- Mock Data for Demonstration ---
  // In a real app, you would get the sessionId from the URL params
  // and fetch the reviewee's details.
  const sessionId = "7c98e083-ac21-419c-9f12-fa3d51c79bc0"; // Replace with a real session ID from your DB for testing
  const revieweeDetails = {
    id: 'user_id_of_mentor', // The ID of the user being reviewed
    name: 'Jane Doe',
    avatar: 'https://github.com/shadcn.png',
    role: 'mentor' as const, // The role of the person being reviewed
  };
  // --- End Mock Data ---

  const handleRatingComplete = () => {
    console.log("Review process completed or skipped.");
    // You can redirect the user after they finish
    // router.push('/dashboard'); 
    alert("Thank you! Redirecting now...");
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
      <SessionRating
        sessionId={sessionId}
        reviewee={revieweeDetails}
        onComplete={handleRatingComplete}
      />
    </div>
  );
}