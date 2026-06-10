import React from "react";
import { Card, CardContent } from "@/components/ui/card";

interface ProfileCompletionCardProps {
  profileCompletion: number;
  missingFields: string[];
}

const ProfileCompletionCard: React.FC<ProfileCompletionCardProps> = ({
  profileCompletion,
  missingFields,
}) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  return (
    <Card className="shadow-sm border">
      <CardContent className="p-6">
        <div className="flex items-center gap-6">
          {/* Circular Progress */}
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 -rotate-90">
              {/* Background Circle */}
              <circle
                cx="48"
                cy="48"
                r={radius}
                stroke="#e5e7eb"
                strokeWidth="8"
                fill="none"
              />

              {/* Progress Circle */}
              <circle
                cx="48"
                cy="48"
                r={radius}
                stroke="#3b82f6"
                strokeWidth="8"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={
                  circumference -
                  (circumference * profileCompletion) / 100
                }
                strokeLinecap="round"
              />
            </svg>

            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-bold text-lg">
                {profileCompletion}%
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1">
            <h3 className="text-lg font-semibold">
              Profile Completion
            </h3>

            <p className="text-sm text-muted-foreground mt-1">
              Complete your profile to get better mentor matches.
            </p>

            {missingFields.length > 0 ? (
              <p className="text-sm text-orange-500 mt-3">
                Remaining Details: {missingFields.slice(0, 3).join(", ")}
                {missingFields.length > 3 &&
                  ` +${missingFields.length - 3} more`}
              </p>
            ) : (
              <p className="text-sm text-green-600 mt-3 font-medium">
                🎉 Your profile is fully complete!
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProfileCompletionCard;