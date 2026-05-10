'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Star,
  Users,
  Clock,
  Play,
  CheckCircle,
  Lock,
  Globe,
  Award,
  BookOpen,
  Video,
  FileText,
  Link as LinkIcon,
  Heart,
  Share2,
  ChevronRight,
  ChevronDown,
  Download
} from 'lucide-react';
import { VideoPlayer } from '@/components/ui/kibo-video-player';
import { useAuth } from '@/contexts/auth-context';
import {
  useCourseEnrollmentStatusQuery,
  useSubmitCourseReviewMutation,
  useToggleCourseReviewHelpfulMutation,
} from '@/hooks/queries/use-learning-queries';
import { toast } from 'sonner';
import { useTRPCClient } from '@/lib/trpc/react';
import { useRazorpayCheckout } from '@/hooks/use-razorpay-checkout';
import type { PaymentCheckoutPayload } from '@/lib/payments/types';

interface CourseDetailViewProps {
  courseId: string;
  onBack?: () => void;
}

interface CourseDetail {
  id: string;
  title: string;
  description: string;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  duration: number;
  price: string;
  currency: string;
  thumbnailUrl: string;
  category: string;
  tags: string[];
  platformTags: string[];
  platformName?: string | null;
  ownerType: 'MENTOR' | 'PLATFORM';
  prerequisites: string[];
  learningOutcomes: string[];
  mentor: {
    id: string | null;
    userId: string | null;
    name: string;
    image: string | null;
    title: string | null;
    company: string | null;
    bio: string | null;
    expertise: string[];
    experience: number | null;
    linkedinUrl?: string;
    websiteUrl?: string;
    twitterUrl?: string;
  };
  curriculum: Module[];
  statistics: {
    avgRating: number;
    reviewCount: number;
    enrollmentCount: number;
    totalDurationSeconds: number;
    contentCounts: {
      modules: number;
      sections: number;
      videos: number;
      documents: number;
      urls: number;
      totalItems: number;
    };
  };
  reviews: Review[];
}

interface Module {
  id: string;
  title: string;
  description: string;
  orderIndex: number;
  learningObjectives: string[];
  estimatedDurationMinutes: number;
  sections: Section[];
}

interface Section {
  id: string;
  title: string;
  description: string;
  orderIndex: number;
  contentItems: ContentItem[];
}

interface ContentItem {
  id: string;
  title: string;
  description: string;
  type: 'VIDEO' | 'PDF' | 'DOCUMENT' | 'URL' | 'TEXT';
  duration: number;
  isPreview: boolean;
  fileUrl?: string;
  content?: string;
}

interface Review {
  id: string;
  rating: number;
  title: string;
  review: string;
  createdAt: string;
  isVerifiedPurchase: boolean;
  helpfulVotes: number;
  student: {
    name: string;
    image: string;
  };
  instructorResponse?: string;
  instructorRespondedAt?: string;
}

interface CourseReview {
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
  viewerHasHelpful?: boolean;
}

export function CourseDetailView({ courseId, onBack }: CourseDetailViewProps) {
  const router = useRouter();
  const { session } = useAuth();
  const trpcClient = useTRPCClient();

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [courseReviews, setCourseReviews] = useState<CourseReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewsOffset, setReviewsOffset] = useState(0);
  const [reviewsHasMore, setReviewsHasMore] = useState(false);
  const [myReview, setMyReview] = useState<CourseReview | null>(null);
  const [reviewForm, setReviewForm] = useState({
    rating: 0,
    title: '',
    review: '',
  });
  const enrollmentQuery = useCourseEnrollmentStatusQuery(
    { courseId },
    Boolean(session && courseId)
  );
  const openPaymentCheckout = useRazorpayCheckout();
  const submitCourseReview = useSubmitCourseReviewMutation();
  const toggleCourseReviewHelpful = useToggleCourseReviewHelpfulMutation();
  const isEnrolled = enrollmentQuery.data?.isEnrolled ?? false;
  const enrollmentData = enrollmentQuery.data?.enrollment ?? null;

  const fetchCourseDetails = useCallback(async () => {
    try {
      setLoading(true);
      const data = await trpcClient.public.getCourse.query({ courseId });

      setCourse(data);
      if (data.curriculum.length > 0) {
        setExpandedModules(new Set([data.curriculum[0].id]));
      }
    } catch (error) {
      console.error('Error fetching course details:', error);
    } finally {
      setLoading(false);
    }
  }, [courseId, trpcClient]);

  const fetchCourseReviews = useCallback(async (nextOffset = 0, append = false) => {
    try {
      setReviewsLoading(true);
      const data = await trpcClient.public.listCourseReviews.query({
        courseId,
        limit: 10,
        offset: nextOffset,
        includeMine: true,
      });

      setCourseReviews((prev) => (append ? [...prev, ...data.reviews] : data.reviews));
      setReviewsOffset(nextOffset);
      setReviewsHasMore(Boolean(data.pagination?.hasMore));
      if (data.myReview) {
        setMyReview(data.myReview);
        setReviewForm({
          rating: data.myReview.rating || 0,
          title: data.myReview.title || '',
          review: data.myReview.review || '',
        });
      } else {
        setMyReview(null);
        setReviewForm({ rating: 0, title: '', review: '' });
      }
    } catch (error) {
      console.error('Error fetching course reviews:', error);
      setCourseReviews([]);
      setReviewsHasMore(false);
    } finally {
      setReviewsLoading(false);
    }
  }, [courseId, trpcClient]);

  useEffect(() => {
    if (courseId) {
      void fetchCourseDetails();
    }
  }, [courseId, fetchCourseDetails]);

  useEffect(() => {
    if (courseId) {
      setReviewsOffset(0);
      setReviewsHasMore(false);
      setMyReview(null);
      setReviewForm({ rating: 0, title: '', review: '' });
      void fetchCourseReviews(0, false);
    }
  }, [courseId, fetchCourseReviews]);

  const handleEnroll = async () => {
    if (!session) {
      router.push('/auth?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }

    try {
      setEnrollmentLoading(true);
      const payment = (await trpcClient.payments.startCourseEnrollment.mutate({
        courseId,
      })) as PaymentCheckoutPayload;
      await openPaymentCheckout(payment);
      await enrollmentQuery.refetch();
      router.push(`/learn/${courseId}`);
    } catch (error) {
      console.error('Error enrolling in course:', error);
    } finally {
      setEnrollmentLoading(false);
    }
  };

  const handleSubmitCourseReview = async () => {
    if (!session) {
      toast.error('Please log in to review this course.');
      return;
    }
    if (!isEnrolled) {
      toast.error('You must be enrolled to leave a review.');
      return;
    }
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
      await submitCourseReview.mutateAsync({
        courseId,
        rating: reviewForm.rating,
        title: reviewForm.title.trim() || undefined,
        review: reviewForm.review.trim() || undefined,
      });
      toast.success('Review submitted');
      await fetchCourseReviews(0, false);
    } catch (error) {
      console.error('Error submitting course review:', error);
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleLoadMoreReviews = async () => {
    if (reviewsLoading || !reviewsHasMore) return;
    await fetchCourseReviews(reviewsOffset + 10, true);
  };

  const toggleHelpfulVote = async (reviewId: string) => {
    if (!session) {
      toast.error('Please log in to vote.');
      return;
    }
    try {
      const data = await toggleCourseReviewHelpful.mutateAsync({ reviewId });

      setCourseReviews((prev) =>
        prev.map((review) =>
          review.id === reviewId
            ? {
                ...review,
                helpfulVotes: data.helpfulVotes,
                viewerHasHelpful: data.viewerHasHelpful,
              }
            : review
        )
      );
    } catch (error) {
      console.error('Error updating helpful vote:', error);
    }
  };

  const toggleModuleExpansion = (moduleId: string) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId);
    } else {
      newExpanded.add(moduleId);
    }
    setExpandedModules(newExpanded);
  };

  const getContentIcon = (type: string) => {
    switch (type) {
      case 'VIDEO':
        return <Video className="w-4 h-4" />;
      case 'PDF':
      case 'DOCUMENT':
        return <FileText className="w-4 h-4" />;
      case 'URL':
        return <LinkIcon className="w-4 h-4" />;
      default:
        return <BookOpen className="w-4 h-4" />;
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'BEGINNER':
        return 'bg-green-100 text-green-800';
      case 'INTERMEDIATE':
        return 'bg-yellow-100 text-yellow-800';
      case 'ADVANCED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatPrice = (price: string, currency: string) => {
    const numPrice = parseFloat(price);
    if (numPrice === 0) return 'Free';
    return `${currency === 'USD' ? '$' : currency}${numPrice}`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const averageRating = courseReviews.length
    ? Number(
        (
          courseReviews.reduce((sum, review) => sum + review.rating, 0) / courseReviews.length
        ).toFixed(1)
      )
    : 0;

  const renderStars = (rating: number) =>
    Array.from({ length: 5 }).map((_, index) => (
      <Star
        key={index}
        className={`w-4 h-4 ${
          index < rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
        }`}
      />
    ));

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="aspect-video w-full" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Course Not Found</h1>
        <p className="text-muted-foreground mb-4">
          The course you're looking for doesn't exist or has been removed.
        </p>
        <Button
          onClick={() =>
            onBack ? onBack() : router.push('/dashboard?section=courses')
          }
        >
          Browse All Courses
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="aspect-video bg-black rounded-lg overflow-hidden mb-6">
            {previewVideo ? (
              <VideoPlayer src={previewVideo} className="w-full h-full" />
            ) : course.thumbnailUrl ? (
              <div className="relative w-full h-full">
                <img
                  src={course.thumbnailUrl}
                  alt={course.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Button
                    size="lg"
                    className="bg-white/20 backdrop-blur-sm hover:bg-white/30"
                    onClick={() => {
                      const previewItem = course.curriculum
                        .flatMap((m) => m.sections)
                        .flatMap((s) => s.contentItems)
                        .find((item) => item.isPreview && item.type === 'VIDEO' && item.fileUrl);

                      if (previewItem?.fileUrl) {
                        setPreviewVideo(previewItem.fileUrl);
                      }
                    }}
                  >
                    <Play className="w-6 h-6 mr-2" />
                    Preview Course
                  </Button>
                </div>
              </div>
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <div className="text-center text-white">
                  <Play className="w-16 h-16 mx-auto mb-4" />
                  <p className="text-xl">Course Preview</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge className={getDifficultyColor(course.difficulty)}>
                  {course.difficulty}
                </Badge>
                <Badge variant="outline">{course.category}</Badge>
              </div>
              <h1 className="text-3xl font-bold mb-4">{course.title}</h1>
              <p className="text-lg text-muted-foreground">{course.description}</p>
            </div>

            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="font-medium">{course.statistics.avgRating.toFixed(1)}</span>
                <span className="text-muted-foreground">
                  ({course.statistics.reviewCount} reviews)
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{course.statistics.enrollmentCount} students</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{formatDuration(course.statistics.totalDurationSeconds)}</span>
              </div>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-start gap-4">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src={course.mentor.image || undefined} />
                    <AvatarFallback>{course.mentor.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold">{course.mentor.name}</h3>
                    {course.mentor.title && (
                      <p className="text-muted-foreground">{course.mentor.title}</p>
                    )}
                    {course.mentor.company && (
                      <p className="text-sm text-muted-foreground">{course.mentor.company}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        <span>{course.statistics.avgRating.toFixed(1)}</span>
                      </div>
                      <span>{course.statistics.reviewCount} reviews</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              {course.mentor.bio && (
                <CardContent>
                  <p className="text-sm">{course.mentor.bio}</p>
                </CardContent>
              )}
            </Card>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
                <TabsTrigger value="reviews">Reviews</TabsTrigger>
                <TabsTrigger value="instructor">Instructor</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>What you'll learn</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {course.learningOutcomes.map((outcome, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                          <span className="text-sm">{outcome}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {course.prerequisites.length > 0 && (
                  <Card>
                    <CardHeader>
                    <CardTitle>Prerequisites</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {course.prerequisites.map((prereq, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full flex-shrink-0 mt-2" />
                            <span className="text-sm">{prereq}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>Course Content</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-primary">
                          {course.statistics.contentCounts.modules}
                        </div>
                        <div className="text-sm text-muted-foreground">Modules</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-primary">
                          {course.statistics.contentCounts.sections}
                        </div>
                        <div className="text-sm text-muted-foreground">Sections</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-primary">
                          {course.statistics.contentCounts.videos}
                        </div>
                        <div className="text-sm text-muted-foreground">Videos</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-primary">
                          {formatDuration(course.statistics.totalDurationSeconds)}
                        </div>
                        <div className="text-sm text-muted-foreground">Total Length</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="curriculum" className="space-y-4">
                {course.curriculum.map((module, moduleIndex) => (
                  <Card key={module.id}>
                    <CardHeader
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleModuleExpansion(module.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                            {moduleIndex + 1}
                          </div>
                          <div>
                            <CardTitle className="text-base">{module.title}</CardTitle>
                            <CardDescription>
                              {module.sections.length} sections •
                              {module.sections.reduce(
                                (acc, section) => acc + section.contentItems.length,
                                0
                              )}{' '}
                              lessons •
                              {module.estimatedDurationMinutes &&
                                ` ${Math.round(module.estimatedDurationMinutes / 60)}h`}
                            </CardDescription>
                          </div>
                        </div>
                        {expandedModules.has(module.id) ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </div>
                    </CardHeader>

                    {expandedModules.has(module.id) && (
                      <CardContent className="pt-0">
                        {module.description && (
                          <p className="text-sm text-muted-foreground mb-4">
                            {module.description}
                          </p>
                        )}

                        <div className="space-y-4">
                          {module.sections.map((section) => (
                            <div key={section.id} className="border-l-2 border-muted pl-4">
                              <h4 className="font-medium mb-2">{section.title}</h4>
                              <div className="space-y-2">
                                {section.contentItems.map((item) => (
                                  <div key={item.id} className="flex items-center gap-3 text-sm">
                                    <div className="flex items-center gap-2 flex-1">
                                      {getContentIcon(item.type)}
                                      <span>{item.title}</span>
                                      {item.isPreview && (
                                        <Badge variant="outline" className="text-xs">
                                          Preview
                                        </Badge>
                                      )}
                                      {!item.isPreview && !isEnrolled && (
                                        <Lock className="w-3 h-3 text-muted-foreground" />
                                      )}
                                    </div>
                                    {item.duration && (
                                      <span className="text-muted-foreground">
                                        {formatDuration(item.duration)}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="reviews" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <CardTitle>Course Reviews</CardTitle>
                        <CardDescription>What learners think about this course.</CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="flex items-center gap-1">
                            {renderStars(Math.round(averageRating))}
                          </div>
                          <span className="text-sm font-medium">
                            {averageRating || '0.0'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {courseReviews.length} review{courseReviews.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isEnrolled ? (
                      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">
                            {myReview ? 'Edit your review' : 'Leave a review'}
                          </p>
                          {myReview && (
                            <span className="text-xs text-muted-foreground">
                              Your review will be updated.
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
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
                            onClick={handleSubmitCourseReview}
                            disabled={reviewSubmitting}
                          >
                            {reviewSubmitting ? 'Submitting...' : myReview ? 'Update' : 'Submit'}
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
                    ) : (
                      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                        Enroll in this course to leave a review.
                      </div>
                    )}

                    <Separator />

                    {reviewsLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-6 w-2/3" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                      </div>
                    ) : courseReviews.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No reviews yet. Be the first to review!
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {courseReviews.map((review) => (
                          <div key={review.id} className="rounded-lg border p-4">
                            <div className="flex items-start gap-3">
                              <Avatar className="h-10 w-10">
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
                                <div className="mt-3">
                                  <Button
                                    variant={review.viewerHasHelpful ? 'secondary' : 'outline'}
                                    size="sm"
                                    onClick={() => toggleHelpfulVote(review.id)}
                                  >
                                    Helpful ({review.helpfulVotes})
                                  </Button>
                                </div>
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
                        {reviewsHasMore && (
                          <div className="flex justify-center">
                            <Button
                              variant="outline"
                              onClick={handleLoadMoreReviews}
                              disabled={reviewsLoading}
                            >
                              {reviewsLoading ? 'Loading...' : 'Load more'}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="instructor" className="space-y-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-6">
                      <Avatar className="w-24 h-24">
                        <AvatarImage src={course.mentor.image || undefined} />
                        <AvatarFallback className="text-2xl">
                          {course.mentor.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold mb-2">{course.mentor.name}</h3>
                        {course.mentor.title && (
                          <p className="text-lg text-muted-foreground mb-4">{course.mentor.title}</p>
                        )}
                        {course.mentor.bio && <p className="text-sm mb-4">{course.mentor.bio}</p>}

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-primary">
                              {course.statistics.avgRating.toFixed(1)}
                            </div>
                            <div className="text-sm text-muted-foreground">Rating</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-primary">
                              {course.statistics.reviewCount}
                            </div>
                            <div className="text-sm text-muted-foreground">Reviews</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-primary">
                              {course.statistics.enrollmentCount}
                            </div>
                            <div className="text-sm text-muted-foreground">Students</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-primary">
                              {course.mentor.experience || 0}
                            </div>
                            <div className="text-sm text-muted-foreground">Years Exp.</div>
                          </div>
                        </div>

                        {(course.mentor.linkedinUrl ||
                          course.mentor.twitterUrl ||
                          course.mentor.websiteUrl) && (
                          <div className="flex gap-2">
                            {course.mentor.linkedinUrl && (
                              <Button variant="outline" size="sm" asChild>
                                <a
                                  href={course.mentor.linkedinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  LinkedIn
                                </a>
                              </Button>
                            )}
                            {course.mentor.twitterUrl && (
                              <Button variant="outline" size="sm" asChild>
                                <a
                                  href={course.mentor.twitterUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Twitter
                                </a>
                              </Button>
                            )}
                            {course.mentor.websiteUrl && (
                              <Button variant="outline" size="sm" asChild>
                                <a
                                  href={course.mentor.websiteUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Website
                                </a>
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-4">
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <div className="text-3xl font-bold mb-2">
                  {formatPrice(course.price, course.currency)}
                </div>
                {parseFloat(course.price) > 0 && (
                  <p className="text-sm text-muted-foreground">One-time payment</p>
                )}
              </div>

              {isEnrolled ? (
                <div className="space-y-4">
                  <div className="text-center">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                    <p className="font-medium text-green-700">You're enrolled!</p>
                    {enrollmentData?.overallProgress > 0 && (
                      <div className="mt-2">
                        <Progress value={enrollmentData.overallProgress} className="mb-1" />
                        <p className="text-xs text-muted-foreground">
                          {enrollmentData.overallProgress}% complete
                        </p>
                      </div>
                    )}
                  </div>
                  <Button className="w-full" onClick={() => router.push(`/learn/${course.id}`)}>
                    {enrollmentData?.overallProgress > 0 ? 'Continue Learning' : 'Start Learning'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleEnroll}
                    disabled={enrollmentLoading}
                  >
                    {enrollmentLoading ? 'Enrolling...' : 'Enroll Now'}
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Heart className="w-4 h-4 mr-1" />
                      Wishlist
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      <Share2 className="w-4 h-4 mr-1" />
                      Share
                    </Button>
                  </div>
                </div>
              )}

              <Separator className="my-6" />

              <div className="space-y-3">
                <h4 className="font-medium">This course includes:</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4" />
                    <span>
                      {formatDuration(course.statistics.totalDurationSeconds)} on-demand video
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span>{course.statistics.contentCounts.documents} articles</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    <span>Downloadable resources</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    <span>Access on mobile and TV</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4" />
                    <span>Certificate of completion</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {course.platformTags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Platform Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {course.platformTags.map((tag, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {course.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {course.tags.map((tag, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => router.push('/dashboard?section=courses')}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
