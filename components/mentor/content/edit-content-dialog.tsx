"use client";

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FileText, Upload, X, Save, Eye, Clock, Loader2, User, BarChart3 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useUpdateContent, useUploadFile, MentorContent } from '@/hooks/queries/use-content-queries';
import { formatDistanceToNow } from 'date-fns';

const editContentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  url: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  urlTitle: z.string().max(100, 'URL title must be less than 100 characters').optional(),
  urlDescription: z.string().max(200, 'URL description must be less than 200 characters').optional(),
});

type EditFormData = z.infer<typeof editContentSchema>;

interface EditContentDialogProps {
  content: MentorContent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditContentDialog({ content, open, onOpenChange }: EditContentDialogProps) {
  const [activeTab, setActiveTab] = useState('details');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  
  const updateContentMutation = useUpdateContent();
  const uploadFileMutation = useUploadFile();
  
  const form = useForm<EditFormData>({
    resolver: zodResolver(editContentSchema),
    defaultValues: {
      title: content.title,
      description: content.description || '',
      url: content.url || '',
      urlTitle: content.urlTitle || '',
      urlDescription: content.urlDescription || '',
    },
  });
  
  // Auto-save functionality
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name && !isAutoSaving) {
        const timeoutId = setTimeout(() => {
          handleAutoSave(value as EditFormData);
        }, 2000);
        
        return () => clearTimeout(timeoutId);
      }
    });
    
    return () => subscription.unsubscribe();
  }, [form.watch, isAutoSaving]);
  
  const handleAutoSave = async (data: EditFormData) => {
    try {
      setIsAutoSaving(true);
      await updateContentMutation.mutateAsync({
        id: content.id,
        data: {
          title: data.title,
          description: data.description,
          // Only include URL fields if this is a URL type content
          ...(content.type === 'URL' ? {
            url: data.url,
            urlTitle: data.urlTitle,
            urlDescription: data.urlDescription,
          } : {}),
        },
      });
    } catch (error) {
      // Silent fail for auto-save
      console.error('Auto-save failed:', error);
    } finally {
      setIsAutoSaving(false);
    }
  };
  
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
    }
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
    }
  };
  
  const onSubmit = async (data: EditFormData) => {
    try {
      let updateData: any = { ...data };
      
      // Handle file replacement for FILE type
      if (content.type === 'FILE' && selectedFile) {
        const uploadResult = await uploadFileMutation.mutateAsync({
          file: selectedFile,
          type: 'content',
        });
        
        updateData = {
          title: data.title,
          description: data.description,
          ...(content.type === 'URL'
            ? {
                url: data.url,
                urlTitle: data.urlTitle,
                urlDescription: data.urlDescription,
              }
            : {}),
          fileUrl: uploadResult.fileUrl,
          fileName: uploadResult.fileName,
          fileSize: uploadResult.fileSize,
          mimeType: uploadResult.mimeType,
        };
      }
      
      await updateContentMutation.mutateAsync({
        id: content.id,
        data: updateData,
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating content:', error);
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'DRAFT':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'PENDING_REVIEW':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'REJECTED':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'ARCHIVED':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'FLAGGED':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };
  
  const isLoading = updateContentMutation.isPending || uploadFileMutation.isPending;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div>
            <DialogTitle className="text-xl">Edit Content</DialogTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={getStatusColor(content.status)}>
                {content.status}
              </Badge>
              <Badge variant="outline">
                {content.type}
              </Badge>
              {isAutoSaving && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="h-3 w-3" />
                  Auto-saving...
                </div>
              )}
            </div>
          </div>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Content Details</TabsTrigger>
            <TabsTrigger value="media" disabled={content.type === 'COURSE'}>
              {content.type === 'FILE' ? 'File Management' : 'URL Settings'}
            </TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter content title"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe your content"
                              rows={4}
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            {field.value?.length || 0}/500 characters
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                  </div>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Content Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Created:</span>
                        <span>{formatDistanceToNow(new Date(content.createdAt), { addSuffix: true })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Last updated:</span>
                        <span>{formatDistanceToNow(new Date(content.updatedAt), { addSuffix: true })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Type:</span>
                        <Badge variant="outline">{content.type}</Badge>
                      </div>
                      {content.type === 'FILE' && content.fileName && (
                        <>
                          <Separator />
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-gray-600">File:</span>
                              <span className="text-right break-all">{content.fileName}</span>
                            </div>
                            {content.fileSize && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Size:</span>
                                <span>{(content.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                              </div>
                            )}
                            {content.mimeType && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Type:</span>
                                <span>{content.mimeType}</span>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                      {content.type === 'URL' && content.url && (
                        <>
                          <Separator />
                          <div className="space-y-2">
                            <div>
                              <span className="text-gray-600">URL:</span>
                              <a 
                                href={content.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="block text-blue-600 hover:text-blue-800 text-xs break-all mt-1"
                              >
                                {content.url}
                              </a>
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>
                
                {content.type === 'URL' && (
                  <div className="space-y-4 pt-4 border-t">
                    <h3 className="font-medium">URL Settings</h3>
                    
                    <FormField
                      control={form.control}
                      name="url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>URL</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://example.com"
                              type="url"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="urlTitle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Display Title</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="How this link should appear"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="urlDescription"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>URL Description</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Additional context"
                                rows={2}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}
                
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
          
          <TabsContent value="media" className="space-y-6">
            {content.type === 'FILE' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">File Management</h3>
                  
                  {content.fileUrl && (
                    <Card className="mb-6">
                      <CardHeader>
                        <CardTitle className="text-sm">Current File</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-3">
                          <FileText className="h-8 w-8 text-gray-500" />
                          <div className="flex-1">
                            <div className="font-medium">{content.fileName}</div>
                            <div className="text-sm text-gray-500">
                              {content.fileSize && `${(content.fileSize / 1024 / 1024).toFixed(2)} MB`}
                              {content.mimeType && ` • ${content.mimeType}`}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(content.fileUrl, '_blank')}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  <div className="space-y-4">
                    <Label>Replace File</Label>
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                        dragActive
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                    >
                      {selectedFile ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-center gap-2 text-green-600">
                            <FileText className="h-5 w-5" />
                            <span className="font-medium">New file selected</span>
                          </div>
                          <div className="bg-gray-50 p-3 rounded">
                            <div className="font-medium">{selectedFile.name}</div>
                            <div className="text-sm text-gray-500">
                              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSelectedFile(null)}
                          >
                            <X className="h-4 w-4 mr-2" />
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                          <div>
                            <p className="font-medium">Drop new file here</p>
                            <p className="text-gray-500">or click to browse</p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => document.getElementById('replace-file-input')?.click()}
                          >
                            Choose File
                          </Button>
                        </div>
                      )}
                      
                      <input
                        id="replace-file-input"
                        type="file"
                        className="hidden"
                        onChange={handleFileSelect}
                        accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,.mov,.avi,.jpg,.jpeg,.png,.webp,.txt"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="analytics" className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Content Analytics</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">Views</span>
                    </div>
                    <div className="text-2xl font-bold mt-2">0</div>
                    <div className="text-xs text-gray-500">Coming soon</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">Engagements</span>
                    </div>
                    <div className="text-2xl font-bold mt-2">0</div>
                    <div className="text-xs text-gray-500">Coming soon</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-medium">Performance</span>
                    </div>
                    <div className="text-2xl font-bold mt-2">-</div>
                    <div className="text-xs text-gray-500">Coming soon</div>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Analytics Dashboard</CardTitle>
                  <CardDescription>
                    Detailed analytics and insights will be available soon
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Analytics features coming in the next update</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
