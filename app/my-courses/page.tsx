'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Play, 
  Clock, 
  BookOpen, 
  Award, 
  TrendingUp,
  Calendar,
  Download
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useEnrolledCoursesQuery } from '@/hooks/queries/use-learning-queries';
import {
  getMenteeFeatureDecision,
  MENTEE_FEATURE_KEYS,
} from '@/lib/mentee/access-policy';

interface EnrolledCourse {
  enrollment: {
    id: string;
    status: 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'DROPPED';
    paymentStatus: string;
    enrolledAt: string;
    lastAccessedAt?: string;
    completedAt?: string;
    overallProgress: number;
    timeSpentMinutes: number;
    currentModuleId?: string;
    currentSectionId?: string;
  };
  course: {
    id: string;
    title: string;
    description: string;
    difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
    duration: number;
    price: string;
    currency: string;
    thumbnailUrl?: string;
    category: string;
    tags: string[];
  };
  mentor: {
    name: string;
    image?: string;
    title?: string;
    company?: string;
  };
  certificate?: {
    status: 'NOT_EARNED' | 'EARNED' | 'ISSUED' | 'REVOKED';
    earnedAt?: string;
    certificateUrl?: string;
  } | null;
}

interface LearningStatistics {
  totalCourses: number;
  activeCourses: number;
  completedCourses: number;
  totalTimeSpent: number;
  averageProgress: number;
  totalCertificates: number;
}

export default function MyCourses() {
  const router = useRouter();
  const { session, isLoading: isAuthLoading, menteeAccess } = useAuth();
  const [activeTab, setActiveTab] = useState('all');
  const learningWorkspaceAccess = getMenteeFeatureDecision(
    menteeAccess,
    MENTEE_FEATURE_KEYS.learningWorkspace
  );
  const hasCourseAccess = Boolean(learningWorkspaceAccess?.allowed);

  const { data, isLoading, error } = useEnrolledCoursesQuery(
    undefined,
    Boolean(session?.user?.id) && hasCourseAccess
  );

  const courses = (data?.courses ?? []) as EnrolledCourse[];
  const statistics = (data?.statistics ?? {
    totalCourses: 0,
    activeCourses: 0,
    completedCourses: 0,
    totalTimeSpent: 0,
    averageProgress: 0,
    totalCertificates: 0,
  }) as LearningStatistics;

  useEffect(() => {
    if (!isAuthLoading && !session) {
      router.push('/auth');
    }
  }, [isAuthLoading, router, session]);

  const filteredCourses = courses.filter((course) => {
    switch (activeTab) {
      case 'active':
        return course.enrollment.status === 'ACTIVE';
      case 'completed':
        return course.enrollment.status === 'COMPLETED';
      case 'certificates':
        return course.certificate?.status === 'ISSUED';
      default:
        return true;
    }
  });

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'BEGINNER': return 'bg-green-100 text-green-800';
      case 'INTERMEDIATE': return 'bg-yellow-100 text-yellow-800';
      case 'ADVANCED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatTimeSpent = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    return `${hours}h ${remainingMins > 0 ? ` ${remainingMins}m` : ''}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-blue-100 text-blue-800';
      case 'COMPLETED': return 'bg-green-100 text-green-800';
      case 'PAUSED': return 'bg-yellow-100 text-yellow-800';
      case 'DROPPED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const StatCard = ({ icon: Icon, title, value, subtitle }: any) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );

  const CourseCard = ({ course }: { course: EnrolledCourse }) => (
    <Card className="group hover:shadow-lg transition-shadow duration-300">
      <div className="aspect-video relative overflow-hidden rounded-t-lg">
        {course.course.thumbnailUrl ? (
          <img 
            src={course.course.thumbnailUrl} 
            alt={course.course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="text-white text-2xl font-bold">{course.course.title.charAt(0)}</span>
          </div>
        )}
        <div className="absolute top-3 right-3 flex gap-2">
          <Badge className={getDifficultyColor(course.course.difficulty)}>
            {course.course.difficulty}
          </Badge>
          <Badge className={getStatusColor(course.enrollment.status)}>
            {course.enrollment.status}
          </Badge>
        </div>
        <div className="absolute bottom-3 left-3">
          <Badge variant="secondary" className="bg-black/70 text-white border-0">
            <Clock className="w-3 h-3 mr-1" />
            {formatDuration(course.course.duration)}
          </Badge>
        </div>
      </div>
      
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg line-clamp-2 group-hover:text-primary transition-colors">
            {course.course.title}
          </CardTitle>
        </div>
        <CardDescription className="line-clamp-2">
          {course.course.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Progress</span>
            <span className="font-medium">{Math.round(course.enrollment.overallProgress)}%</span>
          </div>
          <Progress value={course.enrollment.overallProgress} className="h-2" />
        </div>

        {/* Mentor Info */}
        <div className="flex items-center gap-2">
          <Avatar className="w-6 h-6">
            <AvatarImage src={course.mentor.image} />
            <AvatarFallback>{course.mentor.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground">
            {course.mentor.name}
          </span>
          {course.mentor.company && (
            <>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{course.mentor.company}</span>
            </>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{formatTimeSpent(course.enrollment.timeSpentMinutes)}</span>
            </div>
            {course.enrollment.lastAccessedAt && (
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{new Date(course.enrollment.lastAccessedAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
          <Badge variant="outline">{course.course.category}</Badge>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button 
            onClick={() => router.push(`/learn/${course.course.id}`)}
            className="flex-1"
          >
            <Play className="w-4 h-4 mr-2" />
            {course.enrollment.status === 'COMPLETED' ? 'Review' : 'Continue'}
          </Button>
          {course.certificate?.status === 'ISSUED' && (
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => window.open(course.certificate?.certificateUrl, '_blank')}
            >
              <Download className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (isLoading || isAuthLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-16" />
                </CardHeader>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <Skeleton className="aspect-video rounded-t-lg" />
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-8 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Could not load your courses</CardTitle>
            <CardDescription>
              {error instanceof Error
                ? error.message
                : 'Failed to fetch enrolled courses.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!hasCourseAccess && courses.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">My Learning</h1>
          <p className="text-muted-foreground">
            Track your progress and continue learning from where you left off.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Course access is not included in your plan</CardTitle>
            <CardDescription>
              This account cannot access courses right now. Upgrade the subscription to browse or continue course content.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/dashboard?section=subscription')}>
              View Subscription
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">My Learning</h1>
        <p className="text-muted-foreground">
          Track your progress and continue learning from where you left off.
        </p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={BookOpen}
          title="Total Courses"
          value={statistics.totalCourses}
          subtitle="Enrolled courses"
        />
        <StatCard
          icon={TrendingUp}
          title="Active Courses"
          value={statistics.activeCourses}
          subtitle="In progress"
        />
        <StatCard
          icon={Award}
          title="Completed"
          value={statistics.completedCourses}
          subtitle="Courses finished"
        />
        <StatCard
          icon={Clock}
          title="Time Spent"
          value={formatTimeSpent(statistics.totalTimeSpent)}
          subtitle={`Avg. progress: ${Math.round(statistics.averageProgress)}%`}
        />
      </div>

      {/* Course Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All Courses ({courses.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({statistics.activeCourses})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({statistics.completedCourses})</TabsTrigger>
          <TabsTrigger value="certificates">Certificates ({statistics.totalCertificates})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-6">
          {filteredCourses.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📚</div>
              <h3 className="text-xl font-semibold mb-2">
                {activeTab === 'all' ? 'No courses yet' : `No ${activeTab} courses`}
              </h3>
              <p className="text-muted-foreground mb-4">
                {activeTab === 'all' 
                  ? 'Start your learning journey by enrolling in a course.'
                  : `You don't have any ${activeTab} courses yet.`
                }
              </p>
              {activeTab === 'all' && (
                <Button onClick={() => router.push('/courses')}>
                  Browse Courses
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.map((course) => (
                <CourseCard key={course.enrollment.id} course={course} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
