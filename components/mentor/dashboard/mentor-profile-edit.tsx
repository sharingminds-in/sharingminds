"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/contexts/auth-context"
import {
  useUpdateMentorProfileMutation,
  useUploadMentorProfileFormMutation,
} from "@/hooks/queries/use-mentor-queries"
import {
  Edit3,
  X,
  Loader2,
  User,
  Camera,
  CheckCircle2,
  Briefcase,
  MapPin,
  Phone,
  Mail,
  Globe,
  Linkedin,
  Github,
  DollarSign,
  Clock,
  Star,
  FileText,
  Upload,
  AlertCircle,
  Image as ImageIcon,
  ShieldQuestion
} from "lucide-react"

export function MentorProfileEdit() {
  const { session, mentorProfile, refreshUserData } = useAuth()
  const updateMentorProfileMutation = useUpdateMentorProfileMutation()
  const uploadMentorProfileFormMutation = useUploadMentorProfileFormMutation()
  const [isEditing, setIsEditing] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [isUploadingBanner, setIsUploadingBanner] = useState(false)
  const [isUploadingResume, setIsUploadingResume] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [imageRefresh, setImageRefresh] = useState(0)
  const [bannerRefresh, setBannerRefresh] = useState(0)

  const [mentorData, setMentorData] = useState({
    fullName: '',
    email: '',
    phone: '',
    title: '',
    company: '',
    city: '',
    state: '',
    country: '',
    industry: '',
    expertise: '',
    experience: '',
    about: '',
    linkedinUrl: '',
    githubUrl: '',
    websiteUrl: '',
    hourlyRate: '',
    currency: 'USD',
    availability: '',
    headline: '',
    maxMentees: '10',
    profileImageUrl: '',
    bannerImageUrl: '',
    resumeUrl: '',
    verificationStatus: 'IN_PROGRESS',
    verificationNotes: '',
    isAvailable: true,
    searchMode: 'AI_SEARCH' as 'AI_SEARCH' | 'EXCLUSIVE_SEARCH',
  })

  const [mentorMeta, setMentorMeta] = useState({
    createdAt: '',
    updatedAt: ''
  });

  const hasAdminRateOverride =
    mentorProfile?.adminHourlyRateOverride !== null &&
    mentorProfile?.adminHourlyRateOverride !== undefined;

  // Load mentor profile data only when not editing to avoid losing unsaved form state
  useEffect(() => {
    if (!mentorProfile) return;

    // Prevent overwriting unsaved changes while the user is actively editing
    if (isEditing) return;

    setMentorData({
      fullName: mentorProfile.fullName || session?.user?.name || '',
      email: mentorProfile.email || session?.user?.email || '',
      phone: mentorProfile.phone || '',
      title: mentorProfile.title || '',
      company: mentorProfile.company || '',
      city: mentorProfile.city || '',
      state: mentorProfile.state || '',
      country: mentorProfile.country || '',
      industry: mentorProfile.industry || '',
      expertise: mentorProfile.expertise || '',
      experience: mentorProfile.experience?.toString() || '',
      about: mentorProfile.about || '',
      linkedinUrl: mentorProfile.linkedinUrl || '',
      githubUrl: mentorProfile.githubUrl || '',
      websiteUrl: mentorProfile.websiteUrl || '',
      hourlyRate: mentorProfile.hourlyRate || '',
      currency: mentorProfile.currency || 'USD',
      availability: mentorProfile.availability || '',
      headline: mentorProfile.headline || '',
      maxMentees: mentorProfile.maxMentees?.toString() || '10',
      profileImageUrl: mentorProfile.profileImageUrl || '',
      bannerImageUrl: mentorProfile.bannerImageUrl || '',
      resumeUrl: mentorProfile.resumeUrl || '',
      verificationStatus: mentorProfile.verificationStatus || 'IN_PROGRESS',
      verificationNotes: mentorProfile.verificationNotes || '',
      isAvailable: mentorProfile.isAvailable !== false,
      searchMode: mentorProfile.searchMode || 'AI_SEARCH',
    })

    setMentorMeta({
      createdAt: mentorProfile.createdAt || '',
      updatedAt: mentorProfile.updatedAt || ''
    });
  }, [mentorProfile, isEditing, session?.user])

  const handleImageUpload = async (file: File) => {
    if (!session?.user?.id) return

    try {
      setIsUploadingImage(true)
      const formData = new FormData()
      formData.append('userId', session.user.id)
      formData.append('profilePicture', file)

      const result = await uploadMentorProfileFormMutation.mutateAsync(formData)

      if (result?.profileImageUrl) {
        setMentorData(prev => ({
          ...prev,
          profileImageUrl: result.profileImageUrl,
        }))
      }
      if (typeof result?.updatedAt === 'string') {
        setMentorMeta(prev => ({
          ...prev,
          updatedAt: result.updatedAt,
        }))
      }

      setImageRefresh(Date.now())
      setSuccess('Profile image uploaded and saved successfully!')
      setTimeout(() => setSuccess(null), 3000)

      if (!isEditing) {
        refreshUserData()
      }

    } catch (error) {
      setError('Failed to upload image')
      console.error('Image upload error:', error)
    } finally {
      setIsUploadingImage(false)
    }
  }

  const handleBannerUpload = async (file: File) => {
    if (!session?.user?.id) return

    try {
      setIsUploadingBanner(true)
      const formData = new FormData()
      formData.append('userId', session.user.id)
      formData.append('bannerImage', file)

      const result = await uploadMentorProfileFormMutation.mutateAsync(formData)

      if (result?.bannerImageUrl) {
        setMentorData(prev => ({
          ...prev,
          bannerImageUrl: result.bannerImageUrl,
        }))
      }
      if (typeof result?.updatedAt === 'string') {
        setMentorMeta(prev => ({
          ...prev,
          updatedAt: result.updatedAt,
        }))
      }

      // Force image refresh
      setBannerRefresh(Date.now())

      setSuccess('Banner image uploaded and saved successfully!')
      setTimeout(() => setSuccess(null), 3000)

      if (!isEditing) {
        refreshUserData()
      }

    } catch (error) {
      setError('Failed to upload banner')
      console.error('Banner upload error:', error)
    } finally {
      setIsUploadingBanner(false)
    }
  }

  const handleResumeUpload = async (file: File) => {
    if (!session?.user?.id) return

    try {
      setIsUploadingResume(true)
      setError(null)

      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      const allowedExtensions = ['pdf', 'doc', 'docx'];
      const fileExtension = file.name.split('.').pop()?.toLowerCase();

      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension || '')) {
        setError('Please upload a PDF, DOC, or DOCX file');
        return;
      }

      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setError('Resume file size must be less than 10MB');
        return;
      }

      const formData = new FormData();
      formData.append('userId', session.user.id);
      formData.append('resume', file);

      const result = await uploadMentorProfileFormMutation.mutateAsync(formData)

      if (result?.resumeUrl) {
        setMentorData(prev => ({
          ...prev,
          resumeUrl: result.resumeUrl
        }))
      }
      if (typeof result?.updatedAt === 'string') {
        setMentorMeta(prev => ({
          ...prev,
          updatedAt: result.updatedAt,
        }))
      }

      setSuccess('Resume uploaded and saved successfully!')
      setTimeout(() => setSuccess(null), 3000)
      refreshUserData()

    } catch (error) {
      setError('Failed to upload resume')
      console.error('Resume upload error:', error)
    } finally {
      setIsUploadingResume(false)
    }
  }

  const handleSave = async () => {
    if (!session?.user?.id) return

    try {
      setIsUploadingImage(true) // Reuse loading state
      setError(null)

      const result = await updateMentorProfileMutation.mutateAsync({
        fullName: mentorData.fullName,
        email: mentorData.email,
        phone: mentorData.phone,
        title: mentorData.title,
        company: mentorData.company,
        city: mentorData.city,
        state: mentorData.state,
        country: mentorData.country,
        industry: mentorData.industry,
        expertise: mentorData.expertise,
        experience: mentorData.experience
          ? Number.parseInt(mentorData.experience, 10)
          : null,
        about: mentorData.about,
        linkedinUrl: mentorData.linkedinUrl,
        githubUrl: mentorData.githubUrl,
        websiteUrl: mentorData.websiteUrl,
        hourlyRate: mentorData.hourlyRate,
        currency: mentorData.currency,
        availability: mentorData.availability,
        headline: mentorData.headline,
        maxMentees: mentorData.maxMentees
          ? Number.parseInt(mentorData.maxMentees, 10)
          : null,
        profileImageUrl: mentorData.profileImageUrl,
        bannerImageUrl: mentorData.bannerImageUrl,
        resumeUrl: mentorData.resumeUrl,
        isAvailable: mentorData.isAvailable,
        searchMode: mentorData.searchMode,
      })

      setSuccess('Profile updated successfully!')
      setIsEditing(false)
      setTimeout(() => setSuccess(null), 3000)

      if (result?.updatedAt) {
        setMentorMeta(prev => ({
          createdAt: result.createdAt || prev.createdAt,
          updatedAt: result.updatedAt || prev.updatedAt,
        }));
      }

      refreshUserData()
    } catch (err) {
      setError('Failed to save profile')
      console.error('Save error:', err)
    } finally {
      setIsUploadingImage(false)
    }
  }

  const appendAssetVersion = (
    url: string | null | undefined,
    version: string | number | null
  ) => {
    if (!url) {
      return undefined
    }

    if (!version) {
      return url
    }

    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}v=${encodeURIComponent(String(version))}`
  }

  const currentImage = appendAssetVersion(
    mentorData.profileImageUrl || session?.user?.image,
    imageRefresh || mentorMeta.updatedAt || null
  )
  const currentBannerImage = appendAssetVersion(
    mentorData.bannerImageUrl,
    bannerRefresh || mentorMeta.updatedAt || null
  )

  const industries = [
    "IT & Software", "Marketing & Advertising", "Finance & Banking", "Education",
    "Healthcare", "Entrepreneurship & Startup", "Design (UI/UX, Graphic)", "Sales",
    "Human Resources", "Other"
  ]

  const currencyOptions = ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD'];
  const availabilityOptions = [
    "Weekly (e.g., 1 hour/week)", "Bi-weekly (e.g., 1 hour/bi-week)",
    "Monthly (e.g., 1 hour/month)", "As needed (flexible)"
  ]
  const verificationStatuses = ['YET_TO_APPLY', 'IN_PROGRESS', 'VERIFIED', 'REJECTED', 'REVERIFICATION', 'RESUBMITTED'];

  const calculateCompletion = () => {
    const fields = [
      mentorData.fullName, mentorData.email, mentorData.phone,
      mentorData.title, mentorData.company, mentorData.city, mentorData.country,
      mentorData.industry, mentorData.expertise, mentorData.experience,
      mentorData.about, mentorData.hourlyRate, mentorData.availability,
      mentorData.headline, mentorData.profileImageUrl, mentorData.resumeUrl
    ];

    const filledFields = fields.filter(field => field && field.toString().trim() !== '').length;
    return Math.round((filledFields / fields.length) * 100);
  };

  const completionPercentage = calculateCompletion();

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Mentor Profile</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Manage your professional information and public profile</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-muted-foreground">Profile Complete</div>
            <div className="text-lg font-bold text-primary">{completionPercentage}%</div>
          </div>
          <Button
            variant={isEditing ? "outline" : "default"}
            onClick={() => setIsEditing(!isEditing)}
            className="gap-2 text-sm"
            size="sm"
          >
            {isEditing ? (
              <>
                <X className="h-4 w-4" />
                <span className="hidden xs:inline">Cancel</span> Editing
              </>
            ) : (
              <>
                <Edit3 className="h-4 w-4" />
                <span className="hidden xs:inline">Edit</span> Profile
              </>
            )}
          </Button>
          {isEditing && (
            <Button onClick={handleSave} disabled={isUploadingImage} className="gap-2 text-sm" size="sm">
              {isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              <span className="hidden xs:inline">Save</span> Changes
            </Button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Warning Alert when Editing */}
      {isEditing && (
        <Alert className="mb-6 border-yellow-200 bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-900">
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertTitle>Warning: Profile Update Requires Re-verification</AlertTitle>
          <AlertDescription>
            Saving changes to your profile will trigger a re-verification process.
            <strong> You will not be able to accept new bookings or sessions until your profile is verified again.</strong>
          </AlertDescription>
        </Alert>
      )}

      {/* Success Alert */}
      {success && (
        <Alert className="mb-6 border-green-200 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300 dark:border-green-900">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Profile Overview Card with Banner */}
      <Card className="overflow-hidden">
        {/* Banner Image */}
        <div className="relative h-32 sm:h-40 md:h-48 bg-gradient-to-r from-blue-500 to-purple-500 overflow-hidden group">
          {currentBannerImage ? (
            <img
              src={currentBannerImage}
              alt="Profile Banner"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
              <ImageIcon className="h-12 w-12 opacity-20" />
            </div>
          )}

          {/* Banner Upload Overlay */}
          {(isEditing || isUploadingBanner) && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleBannerUpload(file)
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
                disabled={isUploadingBanner}
              />
              {isUploadingBanner ? (
                <div className="bg-white/90 text-slate-900 px-4 py-2 rounded-full flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Uploading...</span>
                </div>
              ) : (
                <div className="bg-white/90 text-slate-900 px-4 py-2 rounded-full flex items-center gap-2 font-medium hover:bg-white transition-colors">
                  <Camera className="h-4 w-4" />
                  <span>Change Cover</span>
                </div>
              )}
            </div>
          )}
        </div>

        <CardContent className="p-4 pt-5 sm:p-6 sm:pt-6 md:p-8 md:pt-7">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4 sm:gap-6">
            <div className="relative flex-shrink-0 group">
              <Avatar className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 border-4 border-background shadow-sm ring-1 ring-slate-200/70 dark:ring-slate-700/70">
                <AvatarImage src={currentImage || undefined} className="object-cover" />
                <AvatarFallback className="text-3xl font-bold bg-primary/10 text-primary">
                  {mentorData.fullName?.charAt(0) || session?.user?.name?.charAt(0) || 'M'}
                </AvatarFallback>
              </Avatar>

              {isUploadingImage && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                </div>
              )}

              {isEditing && !isUploadingImage && (
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-full">
                  <Camera className="h-8 w-8" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleImageUpload(file)
                    }}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <div className="flex-1 min-w-0 text-center sm:text-left space-y-2">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold truncate">{mentorData.fullName || session?.user?.name || 'Your Name'}</h2>
                <p className="text-sm sm:text-base text-muted-foreground font-medium truncate">
                  {mentorData.title || 'Professional Title'}
                  {mentorData.company && <span className="text-muted-foreground/80"> at {mentorData.company}</span>}
                </p>
              </div>

              {mentorData.headline && (
                <p className="text-sm italic text-muted-foreground/90 max-w-2xl">
                  "{mentorData.headline}"
                </p>
              )}

              <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center sm:justify-start pt-2">
                <Badge variant={mentorProfile?.verificationStatus === 'VERIFIED' ? 'default' : 'secondary'}>
                  {mentorProfile?.verificationStatus?.replace('_', ' ') || 'IN PROGRESS'}
                </Badge>
                {mentorData.hourlyRate && (
                  <Badge variant="outline" className="gap-1">
                    <DollarSign className="h-3 w-3" />
                    {mentorData.currency} {mentorData.hourlyRate}/hr
                  </Badge>
                )}
                {mentorData.city && (
                  <Badge variant="outline" className="gap-1">
                    <MapPin className="h-3 w-3" />
                    {mentorData.city}, {mentorData.country}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Left Column: Personal & Social */}
        <div className="space-y-4 sm:space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Personal Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={mentorData.fullName}
                  onChange={(e) => setMentorData(prev => ({ ...prev, fullName: e.target.value }))}
                  disabled={!isEditing}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={mentorData.email}
                  onChange={(e) => setMentorData(prev => ({ ...prev, email: e.target.value }))}
                  disabled={!isEditing}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={mentorData.phone}
                  onChange={(e) => setMentorData(prev => ({ ...prev, phone: e.target.value }))}
                  disabled={!isEditing}
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={mentorData.city}
                  onChange={(e) => setMentorData(prev => ({ ...prev, city: e.target.value }))}
                  disabled={!isEditing}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={mentorData.country}
                  onChange={(e) => setMentorData(prev => ({ ...prev, country: e.target.value }))}
                  disabled={!isEditing}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                Social Presence
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="linkedin" className="flex items-center gap-2">
                  <Linkedin className="h-4 w-4" /> LinkedIn
                </Label>
                <Input
                  id="linkedin"
                  value={mentorData.linkedinUrl}
                  onChange={(e) => setMentorData(prev => ({ ...prev, linkedinUrl: e.target.value }))}
                  disabled={!isEditing}
                  placeholder="https://linkedin.com/in/..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="github" className="flex items-center gap-2">
                  <Github className="h-4 w-4" /> GitHub
                </Label>
                <Input
                  id="github"
                  value={mentorData.githubUrl}
                  onChange={(e) => setMentorData(prev => ({ ...prev, githubUrl: e.target.value }))}
                  disabled={!isEditing}
                  placeholder="https://github.com/..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Personal Website
                </Label>
                <Input
                  id="website"
                  value={mentorData.websiteUrl}
                  onChange={(e) => setMentorData(prev => ({ ...prev, websiteUrl: e.target.value }))}
                  disabled={!isEditing}
                  placeholder="https://..."
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Professional Details */}
        <div className="space-y-4 sm:space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Briefcase className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Professional & Expertise
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Share your experience and what you can teach.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6 pt-0 sm:pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Job Title</Label>
                  <Input
                    id="title"
                    value={mentorData.title}
                    onChange={(e) => setMentorData(prev => ({ ...prev, title: e.target.value }))}
                    disabled={!isEditing}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    value={mentorData.company}
                    onChange={(e) => setMentorData(prev => ({ ...prev, company: e.target.value }))}
                    disabled={!isEditing}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Select
                    value={mentorData.industry}
                    onValueChange={(value) => setMentorData(prev => ({ ...prev, industry: value }))}
                    disabled={!isEditing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {industries.map((industry) => (
                        <SelectItem key={industry} value={industry}>
                          {industry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="experience">Years of Experience</Label>
                  <Input
                    id="experience"
                    type="number"
                    min="0"
                    value={mentorData.experience}
                    onChange={(e) => setMentorData(prev => ({ ...prev, experience: e.target.value }))}
                    disabled={!isEditing}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="headline">Professional Headline</Label>
                <Input
                  id="headline"
                  value={mentorData.headline}
                  onChange={(e) => setMentorData(prev => ({ ...prev, headline: e.target.value }))}
                  disabled={!isEditing}
                  placeholder="e.g. Senior Software Engineer at TechCorp"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="about">About Me</Label>
                <Textarea
                  id="about"
                  value={mentorData.about}
                  onChange={(e) => setMentorData(prev => ({ ...prev, about: e.target.value }))}
                  disabled={!isEditing}
                  className="min-h-[120px]"
                  placeholder="Tell mentees about your journey..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expertise">Key Expertise (comma separated)</Label>
                <Textarea
                  id="expertise"
                  value={mentorData.expertise}
                  onChange={(e) => setMentorData(prev => ({ ...prev, expertise: e.target.value }))}
                  disabled={!isEditing}
                  placeholder="React, Leadership, Career Growth, etc."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Rates & Availability
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="hourlyRate">Your hourly rate ({mentorData.currency})</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                    <Input
                      id="hourlyRate"
                      type="number"
                      min="0"
                      className="pl-7"
                      value={mentorData.hourlyRate}
                      onChange={(e) => setMentorData(prev => ({ ...prev, hourlyRate: e.target.value }))}
                      disabled={!isEditing}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    value={mentorData.currency}
                    onValueChange={(value) => setMentorData(prev => ({ ...prev, currency: value }))}
                    disabled={!isEditing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="USD" />
                    </SelectTrigger>
                    <SelectContent>
                      {currencyOptions.map((curr) => (
                        <SelectItem key={curr} value={curr}>
                          {curr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {hasAdminRateOverride && (
                <Alert>
                  <DollarSign className="h-4 w-4" />
                  <AlertTitle>Platform rate override active</AlertTitle>
                  <AlertDescription>
                    Your requested rate is {mentorData.currency}{' '}
                    {mentorData.hourlyRate || '0'}/hr. Mentees currently see
                    and pay {mentorData.currency}{' '}
                    {mentorProfile.adminHourlyRateOverride}/hr for standard
                    sessions.
                    {mentorProfile.rateOverrideReason
                      ? ` Reason: ${mentorProfile.rateOverrideReason}`
                      : ''}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="availability">Weekly Availability</Label>
                <Select
                  value={mentorData.availability}
                  onValueChange={(value) => setMentorData(prev => ({ ...prev, availability: value }))}
                  disabled={!isEditing}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select availability" />
                  </SelectTrigger>
                  <SelectContent>
                    {availabilityOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div className="space-y-1">
                    <Label htmlFor="includeInAiSearch" className="text-sm font-medium">
                      Include me in AI Search
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Turn this on to appear in AI recommendations.
                    </p>
                  </div>
                  <Switch
                    id="includeInAiSearch"
                    checked={mentorData.searchMode === 'AI_SEARCH'}
                    onCheckedChange={(checked) => {
                      if (!isEditing) {
                        setIsEditing(true)
                      }
                      setMentorData((prev) => ({
                        ...prev,
                        searchMode: checked ? 'AI_SEARCH' : 'EXCLUSIVE_SEARCH',
                      }))
                    }}
                  />
                </div>

                <Alert className="border-blue-100 bg-blue-50/60 dark:border-blue-900/60 dark:bg-blue-950/20">
                  <ShieldQuestion className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <AlertTitle className="text-blue-900 dark:text-blue-200">
                    {mentorData.searchMode === 'AI_SEARCH' ? 'AI Search enabled' : 'Exclusive Search enabled'}
                  </AlertTitle>
                  <AlertDescription className="text-blue-800/90 dark:text-blue-300/90">
                    {mentorData.searchMode === 'AI_SEARCH'
                      ? 'You may be discovered via AI recommendations. AI bookings use platform plan pricing configured by admin.'
                      : 'You will not appear in AI search. Your sessions use your listed mentor fee.'}
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Resume
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mentorData.resumeUrl ? (
                <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-primary/60" />
                    <div>
                      <p className="font-medium">Current Resume</p>
                      <p className="text-xs text-muted-foreground">Uploaded PDF/DOC</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => window.open(mentorData.resumeUrl, '_blank')}>
                      View
                    </Button>
                    {isEditing && (
                      <div className="relative">
                        <Button variant="secondary" size="sm" disabled={isUploadingResume}>
                          {isUploadingResume ? <Loader2 className="h-4 w-4 animate-spin" /> : "Replace"}
                        </Button>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleResumeUpload(file)
                          }}
                          disabled={isUploadingResume}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-3">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                  <div className="space-y-1">
                    <p className="font-medium">No resume uploaded</p>
                    <p className="text-xs text-muted-foreground">Upload your CV to verify your experience</p>
                  </div>
                  {isEditing && (
                    <div className="relative inline-block">
                      <Button disabled={isUploadingResume}>
                        {isUploadingResume ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                        Upload Resume
                      </Button>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleResumeUpload(file)
                        }}
                        disabled={isUploadingResume}
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>


        </div>
      </div>
    </div>
  )
}
