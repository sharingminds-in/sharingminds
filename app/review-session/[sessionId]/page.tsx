"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SessionRating } from "@/components/booking/SessionRating";
import { useSession } from "@/lib/auth-client"; // Assuming this hook provides the current user's session
import { use } from "react"; // Import React's `use` function
import { useTRPCClient } from "@/lib/trpc/react";

interface ReviewSessionPageProps {
  params: Promise<{ sessionId: string }>; // `params` is now a Promise
}

export default function ReviewSessionPage({ params }: ReviewSessionPageProps) {
  const router = useRouter();
  const trpcClient = useTRPCClient();
  const unwrappedParams = use(params); // Unwrap the `params` Promise
  const sessionId = unwrappedParams.sessionId; // Access the `sessionId` property

  const { data: session, isPending, error: sessionError } = useSession(); // Get the current user's session and loading state
  const currentUserId = session?.user?.id; // Get the current user's ID

  const [reviewee, setReviewee] = useState<{
    id: string;
    name: string;
    avatar?: string | null;
    role: "mentor" | "mentee";
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSessionDetails = async () => {
      try {
        // Wait until the session is fully loaded
        if (isPending || !currentUserId) {
          return;
        }

        setIsLoading(true);
        setError(null);

        // Fetch session details from the API
        const data = await trpcClient.bookings.sessionView.query({ sessionId });

        // Determine the role of the reviewee dynamically
        const isMenteeReviewing = currentUserId === data.menteeId;

        setReviewee({
          id: isMenteeReviewing ? data.mentor.id : data.mentee.id,
          name: isMenteeReviewing ? data.mentor.name : data.mentee.name,
          avatar: isMenteeReviewing ? data.mentor.image : data.mentee.image,
          role: isMenteeReviewing ? "mentor" : "mentee",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch session details.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSessionDetails();
  }, [currentUserId, isPending, sessionId, trpcClient]);

  if (isLoading || isPending) {
    return (
      <div className="flex w-full max-w-2xl flex-col items-center justify-center rounded-2xl bg-white p-12 shadow-2xl dark:bg-gray-800">
        <p className="text-lg text-gray-600 dark:text-gray-400">Loading session details...</p>
      </div>
    );
  }

  if (error || sessionError) {
    return (
      <div className="flex w-full max-w-2xl flex-col items-center justify-center rounded-2xl bg-white p-12 shadow-2xl dark:bg-gray-800">
        <p className="text-lg text-red-500">{error}</p>
        <button
          className="mt-4 rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          onClick={() => router.push("/dashboard")}
        >
          Go Back to Dashboard
        </button>
      </div>
    );
  }

  if (!reviewee) {
    return (
      <div className="flex w-full max-w-2xl flex-col items-center justify-center rounded-2xl bg-white p-12 shadow-2xl dark:bg-gray-800">
        <p className="text-lg text-gray-600 dark:text-gray-400">No reviewee found for this session.</p>
        <button
          className="mt-4 rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          onClick={() => router.push("/dashboard")}
        >
          Go Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <SessionRating
      sessionId={sessionId}
      reviewee={reviewee}
      onComplete={() => router.push("/dashboard")}
    />
  );
}
