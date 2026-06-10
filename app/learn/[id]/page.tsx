'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Play,
  Pause,
  CheckCircle,
  Circle,
  BookOpen,
  Video,
  FileText,
  Link as LinkIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Award,
  Bookmark,
  BookmarkCheck,
  Download,
  Share2,
  MoreVertical,
  Menu,
  Star,
  X
} from 'lucide-react';
import { VideoPlayer } from '@/components/ui/kibo-video-player';
import { MenteeFeaturePageGate } from '@/components/mentee/access/mentee-feature-state';
import { useAuth } from '@/contexts/auth-context';
import {
  useCourseProgressQuery,
  useSubmitContentItemReviewMutation,
  useUpdateCourseProgressMutation,
} from '@/hooks/queries/use-learning-queries';
import {
  getMenteeFeatureDecision,
  MENTEE_FEATURE_KEYS,
} from '@/lib/mentee/access-policy';
import { toast } from 'sonner';
import { useTRPCClient } from '@/lib/trpc/react';

interface LearningProgress {
  enrollment: {
    id: string;
    overallProgress: number;
    timeSpentMinutes: number;
    currentModuleId?: string;
    currentSectionId?: string;
    lastAccessedAt?: string;
  };
  progress: {
    overallProgress: number;
    totalContentItems: number;
    completedItems: number;
    totalDurationSeconds: number;
    completedDurationSeconds: number;
    modules: LearningModule[];
  };
  recentActivity: any[];
  bookmarks: any[];
}

interface LearningModule {
  id: string;
  title: string;
  orderIndex: number;
  sections: LearningSection[];
  progress: {
    totalItems: number;
    completedItems: number;
    overallProgress: number;
  };
}

interface LearningSection {
  id: string;
  title: string;
  orderIndex: number;
  contentItems: LearningContentItem[];
  progress: {
    totalItems: number;
    completedItems: number;
    overallProgress: number;
  };
}

interface LearningContentItem {
  id: string;
  title: string;
  type: 'VIDEO' | 'PDF' | 'DOCUMENT' | 'URL' | 'TEXT';
  duration: number;
  orderIndex: number;
  fileUrl?: string;
  content?: string;
  fileName?: string;
  mimeType?: string;
  progress: {
    id?: string;
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
    progressPercentage: number;
    timeSpentSeconds: number;
    lastWatchedPosition: number;
    watchCount: number;
    firstStartedAt?: string;
    lastAccessedAt?: string;
    completedAt?: string;
    studentNotes?: string;
    isBookmarked: boolean;
  };
}

type LearningProgressStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'SKIPPED';

interface ContentItemReview {
  id: string;
  rating: number;
  title: string | null;
  review: string | null;
  createdAt: string;
  helpfulVotes: number;
  instructorResponse: string | null;
  instructorRespondedAt: string | null;
  reviewerName: string | null;
  reviewerImage: string | null;
}

export default function LearnCoursePage() {
  const params = useParams();
  const router = useRouter();
  const { session, menteeAccess } = useAuth();
  const trpcClient = useTRPCClient();
  const courseId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const learningWorkspaceAccess = getMenteeFeatureDecision(
    menteeAccess,
    MENTEE_FEATURE_KEYS.learningWorkspace
  );
  const canUseLearningWorkspace = Boolean(learningWorkspaceAccess?.allowed);

  const [courseData, setCourseData] = useState<LearningProgress | null>(null);
  const [currentItem, setCurrentItem] = useState<LearningContentItem | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [studentNotes, setStudentNotes] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);
  const [itemReviews, setItemReviews] = useState<ContentItemReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    rating: 0,
    title: '',
    review: '',
  });
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [reviewFormOpen, setReviewFormOpen] = useState(false);
  const courseProgressQuery = useCourseProgressQuery(
    { courseId },
    Boolean(courseId && session && canUseLearningWorkspace)
  );
  const updateCourseProgressMutation = useUpdateCourseProgressMutation();
  const submitContentItemReview = useSubmitContentItemReviewMutation();
  const loading = courseProgressQuery.isLoading && !courseData;

  useEffect(() => {
    if (courseProgressQuery.data) {
      const courseProgressData = courseProgressQuery.data as LearningProgress;
      setCourseData(courseProgressData);
      if (currentItem?.id) {
        const refreshedCurrentItem = findContentItemById(
          courseProgressData,
          currentItem.id
        );
        if (refreshedCurrentItem) {
          setCurrentItem(refreshedCurrentItem);
          setStudentNotes(refreshedCurrentItem.progress.studentNotes || '');
          return;
        }
      }

      const firstIncompleteItem = findFirstIncompleteItem(courseProgressData);
      if (firstIncompleteItem) {
        setCurrentItem(firstIncompleteItem);
        setStudentNotes(firstIncompleteItem.progress.studentNotes || '');
      }
    }
  }, [courseProgressQuery.data, currentItem?.id]);

  useEffect(() => {
    if (courseProgressQuery.error && courseId) {
      router.push(`/dashboard?section=courses&courseId=${courseId}`);
    }
  }, [courseId, courseProgressQuery.error, router]);

  const findFirstIncompleteItem = (
    data: LearningProgress
  ): LearningContentItem | null => {
    for (const module of data.progress.modules) {
      for (const section of module.sections) {
        for (const item of section.contentItems) {
          if (item.progress.status !== 'COMPLETED') {
            return item;
          }
        }
      }
    }

    // If all completed, return the first item
    return data.progress.modules[0]?.sections[0]?.contentItems[0] || null;
  };

  const findContentItemById = (
    data: LearningProgress,
    itemId: string
  ): LearningContentItem | null => {
    for (const module of data.progress.modules) {
      for (const section of module.sections) {
        for (const item of section.contentItems) {
          if (item.id === itemId) {
            return item;
          }
        }
      }
    }

    return null;
  };

  const updateProgress = async (
    contentItemId: string,
    updates: {
      status?: LearningProgressStatus;
      progressPercentage?: number;
      timeSpentSeconds?: number;
      lastWatchedPosition?: number;
      studentNotes?: string;
      isBookmarked?: boolean;
    }
  ) => {
    try {
      setUpdateLoading(true);
      await updateCourseProgressMutation.mutateAsync({
        courseId,
        contentItemId,
        ...updates,
      });
      await courseProgressQuery.refetch();
      return true;
    } catch (error) {
      console.error('Error updating progress:', error);
    } finally {
      setUpdateLoading(false);
    }
    return false;
  };

  const markAsComplete = async () => {
    if (!currentItem) return;

    const success = await updateProgress(currentItem.id, {
      status: 'COMPLETED',
      progressPercentage: 100,
    });

    if (success) {
      // Move to next item
      const nextItem = getNextItem();
      if (nextItem) {
        setCurrentItem(nextItem);
        setStudentNotes(nextItem.progress.studentNotes || '');
      }
    }
  };

  const toggleBookmark = async () => {
    if (!currentItem) return;

    await updateProgress(currentItem.id, {
      isBookmarked: !currentItem.progress.isBookmarked,
    });
  };

  const saveNotes = async () => {
    if (!currentItem) return;

    await updateProgress(currentItem.id, {
      studentNotes,
    });
  };

  const getNextItem = (): LearningContentItem | null => {
    if (!courseData || !currentItem) return null;

    let foundCurrent = false;

    for (const module of courseData.progress.modules) {
      for (const section of module.sections) {
        for (const item of section.contentItems) {
          if (foundCurrent) {
            return item;
          }
          if (item.id === currentItem.id) {
            foundCurrent = true;
          }
        }
      }
    }

    return null;
  };

  const getPreviousItem = (): LearningContentItem | null => {
    if (!courseData || !currentItem) return null;

    let previousItem: LearningContentItem | null = null;

    for (const module of courseData.progress.modules) {
      for (const section of module.sections) {
        for (const item of section.contentItems) {
          if (item.id === currentItem.id) {
            return previousItem;
          }
          previousItem = item;
        }
      }
    }

    return null;
  };

  const navigateToItem = (item: LearningContentItem) => {
    setCurrentItem(item);
    setStudentNotes(item.progress.studentNotes || '');
    
    // Mark as started if not already
    if (item.progress.status === 'NOT_STARTED') {
      updateProgress(item.id, {
        status: 'IN_PROGRESS',
        progressPercentage: 0,
      });
    }
  };

  const fetchItemReviews = useCallback(async (itemId: string) => {
    try {
      setReviewsLoading(true);
      const data = await trpcClient.public.listContentItemReviews.query({
        courseId,
        itemId,
        limit: 20,
        offset: 0,
      });
      setItemReviews(data.reviews);
    } catch (error) {
      console.error('Failed to load reviews:', error);
      toast.error('Failed to load reviews');
      setItemReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  }, [courseId, trpcClient]);

  const handleSubmitReview = async () => {
    if (!currentItem) return;
    if (!reviewForm.rating) {
      toast.error('Please select a rating.');
      return;
    }
    if (!reviewForm.title.trim() && !reviewForm.review.trim()) {
      toast.error('Please add a title or review text.');
      return;
    }

    try {
      setReviewSubmitting(true);
      await submitContentItemReview.mutateAsync({
        courseId,
        itemId: currentItem.id,
        rating: reviewForm.rating,
        title: reviewForm.title.trim() || undefined,
        review: reviewForm.review.trim() || undefined,
      });

      toast.success('Review submitted');
      setReviewForm({ rating: 0, title: '', review: '' });
      await fetchItemReviews(currentItem.id);
    } catch (error) {
      console.error('Failed to submit review:', error);
    } finally {
      setReviewSubmitting(false);
    }
  };

  useEffect(() => {
    if (currentItem?.id) {
      setReviewForm({ rating: 0, title: '', review: '' });
      setReviewPanelOpen(false);
      setReviewFormOpen(false);
      void fetchItemReviews(currentItem.id);
    }
  }, [currentItem?.id, fetchItemReviews]);

  const renderStars = (rating: number) =>
    Array.from({ length: 5 }).map((_, index) => (
      <Star
        key={index}
        className={`h-4 w-4 ${
          index < rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
        }`}
      />
    ));

  const getContentIcon = (type: string) => {
    switch (type) {
      case 'VIDEO': return <Video className="w-4 h-4" />;
      case 'PDF':
      case 'DOCUMENT': return <FileText className="w-4 h-4" />;
      case 'URL': return <LinkIcon className="w-4 h-4" />;
      default: return <BookOpen className="w-4 h-4" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'IN_PROGRESS': return <Play className="w-4 h-4 text-blue-500" />;
      default: return <Circle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const averageRating = itemReviews.length
    ? Number(
        (
          itemReviews.reduce((sum, review) => sum + review.rating, 0) / itemReviews.length
        ).toFixed(1)
      )
    : 0;

  if (loading) {
    return (
      <div className="h-screen flex">
        <div className="w-80 border-r bg-muted/10">
          <div className="p-4 space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-2 w-full" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1">
          <Skeleton className="aspect-video w-full" />
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (session && learningWorkspaceAccess && !learningWorkspaceAccess.allowed) {
    return (
      <div className='mx-auto w-full max-w-6xl p-6'>
        <MenteeFeaturePageGate
          feature={MENTEE_FEATURE_KEYS.learningWorkspace}
          access={learningWorkspaceAccess}
          routeBasePath='/dashboard'
        />
      </div>
    );
  }

  if (!courseData) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg mb-4">Course not found or access denied</p>
          <Button onClick={() => router.push('/courses')}>
            Browse Courses
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-background">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-80 border-r bg-muted/10 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold truncate">Course Progress</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <Progress value={courseData.enrollment.overallProgress} />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{courseData.progress.completedItems} / {courseData.progress.totalContentItems} lessons</span>
                <span>{courseData.enrollment.overallProgress}%</span>
              </div>
            </div>
          </div>

          {/* Content Navigation */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {courseData.progress.modules.map((module) => (
                <div key={module.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">{module.title}</h3>
                    <Badge variant="outline" className="text-xs">
                      {module.progress.overallProgress}%
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    {module.sections.map((section) => (
                      <div key={section.id} className="space-y-1">
                        <p className="text-xs text-muted-foreground px-2">
                          {section.title}
                        </p>
                        {section.contentItems.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => navigateToItem(item)}
                            className={`w-full flex items-center gap-3 p-2 rounded-lg text-left hover:bg-muted/50 transition-colors ${
                              currentItem?.id === item.id ? 'bg-muted' : ''
                            }`}
                          >
                            {getStatusIcon(item.progress.status)}
                            {getContentIcon(item.type)}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">{item.title}</p>
                              {item.duration > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {formatDuration(item.duration)}
                                </p>
                              )}
                            </div>
                            {item.progress.isBookmarked && (
                              <BookmarkCheck className="w-3 h-3 text-blue-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/dashboard?section=my-courses')}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            {!sidebarOpen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-4 h-4" />
              </Button>
            )}
            <div>
              <h1 className="font-semibold">{currentItem?.title}</h1>
              <p className="text-sm text-muted-foreground">
                {courseData.progress.completedItems} / {courseData.progress.totalContentItems} completed
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleBookmark}
              disabled={updateLoading}
            >
              {currentItem?.progress.isBookmarked ? (
                <BookmarkCheck className="w-4 h-4 text-blue-500" />
              ) : (
                <Bookmark className="w-4 h-4" />
              )}
            </Button>
            <Button variant="ghost" size="sm">
              <Share2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col">
          {currentItem ? (
            <>
              {/* Video/Content Player */}
              {currentItem.type === 'VIDEO' && (
                <div className="aspect-video bg-black">
                  {currentItem.fileUrl ? (
                    <VideoPlayer
                      src={currentItem.fileUrl}
                      className="w-full h-full"
                      onTimeUpdate={(currentTime, duration) => {
                        if (currentTime > currentItem.progress.lastWatchedPosition + 10) {
                          updateProgress(currentItem.id, {
                            lastWatchedPosition: Math.floor(currentTime),
                            timeSpentSeconds: currentItem.progress.timeSpentSeconds + 10,
                            progressPercentage: Math.min(100, (currentTime / duration) * 100),
                            status: currentTime / duration > 0.9 ? 'COMPLETED' : 'IN_PROGRESS',
                          });
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white">
                      <div className="text-center">
                        <Video className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-lg">Video not available</p>
                        <p className="text-sm text-muted-foreground">The video file is missing or unavailable.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Document/URL/Text Content */}
              {currentItem.type !== 'VIDEO' && (
                <div className="p-8 flex-1 overflow-auto">
                  <div className="max-w-4xl mx-auto">
                    {currentItem.type === 'PDF' && (
                      <div className="text-center py-12">
                        <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-xl font-semibold mb-2">PDF Document</h3>
                        <p className="text-muted-foreground mb-4">
                          {currentItem.title}
                        </p>
                        {currentItem.fileUrl ? (
                          <Button asChild>
                            <a href={currentItem.fileUrl} target="_blank" rel="noopener noreferrer">
                              <Download className="w-4 h-4 mr-2" />
                              Download PDF
                            </a>
                          </Button>
                        ) : (
                          <div className="text-muted-foreground">
                            <p>PDF file not available</p>
                          </div>
                        )}
                      </div>
                    )}

                    {currentItem.type === 'URL' && (
                      <div className="text-center py-12">
                        <LinkIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-xl font-semibold mb-2">External Resource</h3>
                        <p className="text-muted-foreground mb-4">
                          {currentItem.title}
                        </p>
                        {currentItem.content ? (
                          <Button asChild>
                            <a href={currentItem.content} target="_blank" rel="noopener noreferrer">
                              Open Link
                            </a>
                          </Button>
                        ) : (
                          <div className="text-muted-foreground">
                            <p>URL not available</p>
                          </div>
                        )}
                      </div>
                    )}

                    {currentItem.type === 'TEXT' && (
                      <div className="prose max-w-none">
                        <h1>{currentItem.title}</h1>
                        <p>This is placeholder text content for the lesson.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Reviews */}
              <div className="border-t p-6 max-h-[45vh] overflow-hidden">
                <div className="max-w-4xl mx-auto">
                  <Card>
                    <CardHeader className="pb-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="space-y-1">
                          <CardTitle className="text-lg">Lesson Reviews</CardTitle>
                          <CardDescription>Feedback for this specific item.</CardDescription>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            {renderStars(Math.round(averageRating))}
                          </div>
                          <span className="text-sm font-medium">{averageRating || '0.0'}</span>
                          <span className="text-xs text-muted-foreground">
                            ({itemReviews.length})
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setReviewPanelOpen((prev) => !prev)}
                          >
                            {reviewPanelOpen ? 'Hide' : 'Show'}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    {reviewPanelOpen && (
                      <CardContent className="space-y-5 max-h-[36vh] overflow-y-auto pr-1">
                        <div className="rounded-lg border bg-muted/30 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">Write a review</p>
                              <p className="text-xs text-muted-foreground">
                                Rate this lesson and share your thoughts.
                              </p>
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setReviewFormOpen((prev) => !prev)}
                            >
                              {reviewFormOpen ? 'Close' : 'Add Review'}
                            </Button>
                          </div>

                          {reviewFormOpen && (
                            <div className="mt-4 space-y-3">
                              <div className="flex items-center gap-2">
                                {Array.from({ length: 5 }).map((_, index) => {
                                  const value = index + 1;
                                  const isActive = value <= reviewForm.rating;
                                  return (
                                    <button
                                      key={value}
                                      type="button"
                                      onClick={() =>
                                        setReviewForm((prev) => ({ ...prev, rating: value }))
                                      }
                                      className="p-1"
                                      aria-label={`Rate ${value} star${value === 1 ? '' : 's'}`}
                                    >
                                      <Star
                                        className={`h-5 w-5 ${
                                          isActive
                                            ? 'fill-yellow-400 text-yellow-400'
                                            : 'text-muted-foreground'
                                        }`}
                                      />
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <Input
                                  placeholder="Title (optional)"
                                  value={reviewForm.title}
                                  onChange={(event) =>
                                    setReviewForm((prev) => ({
                                      ...prev,
                                      title: event.target.value,
                                    }))
                                  }
                                />
                                <Button
                                  className="md:justify-self-end"
                                  onClick={handleSubmitReview}
                                  disabled={reviewSubmitting}
                                >
                                  {reviewSubmitting ? 'Submitting...' : 'Submit'}
                                </Button>
                              </div>
                              <Textarea
                                placeholder="Write your review..."
                                rows={3}
                                value={reviewForm.review}
                                onChange={(event) =>
                                  setReviewForm((prev) => ({
                                    ...prev,
                                    review: event.target.value,
                                  }))
                                }
                              />
                            </div>
                          )}
                        </div>

                        <Separator />

                        {reviewsLoading ? (
                          <div className="space-y-3">
                            <Skeleton className="h-6 w-2/3" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-5/6" />
                          </div>
                        ) : itemReviews.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No reviews yet. Be the first to share feedback.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {itemReviews.map((review) => (
                              <div key={review.id} className="rounded-lg border p-4">
                                <div className="flex items-start gap-3">
                                  <Avatar className="h-9 w-9">
                                    <AvatarImage src={review.reviewerImage || undefined} />
                                    <AvatarFallback>
                                      {review.reviewerName?.charAt(0) || 'U'}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-medium">
                                        {review.reviewerName || 'Anonymous'}
                                      </p>
                                      <div className="flex items-center gap-1">
                                        {renderStars(review.rating)}
                                      </div>
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(review.createdAt).toLocaleDateString()}
                                      </span>
                                    </div>
                                    {review.title && (
                                      <p className="mt-2 text-sm font-semibold">{review.title}</p>
                                    )}
                                    {review.review && (
                                      <p className="mt-1 text-sm text-muted-foreground">
                                        {review.review}
                                      </p>
                                    )}
                                    {review.instructorResponse && (
                                      <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                                        <p className="font-medium">Instructor response</p>
                                        <p className="text-muted-foreground">
                                          {review.instructorResponse}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                </div>
              </div>

              {/* Bottom Controls */}
              <div className="border-t p-4">
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const prev = getPreviousItem();
                      if (prev) navigateToItem(prev);
                    }}
                    disabled={!getPreviousItem()}
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Previous
                  </Button>

                  <div className="flex items-center gap-2">
                    {currentItem.progress.status !== 'COMPLETED' && (
                      <Button onClick={markAsComplete} disabled={updateLoading}>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Mark Complete
                      </Button>
                    )}
                  </div>

                  <Button
                    onClick={() => {
                      const next = getNextItem();
                      if (next) {
                        navigateToItem(next);
                      } else {
                        // Course completed
                        router.push(`/dashboard?section=courses&courseId=${courseId}`);
                      }
                    }}
                    disabled={!getNextItem() && courseData.enrollment.overallProgress !== 100}
                  >
                    {!getNextItem() && courseData.enrollment.overallProgress === 100 ? (
                      <>
                        <Award className="w-4 h-4 mr-2" />
                        Complete Course
                      </>
                    ) : (
                      <>
                        Next
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted-foreground">Select a lesson to begin</p>
            </div>
          )}
        </div>
      </div>

      {/* Notes Panel (if needed) */}
      {/* This could be a collapsible side panel for taking notes */}
    </div>
  );
}
