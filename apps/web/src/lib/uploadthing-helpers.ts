import {
  generateUploadButton,
  generateUploadDropzone,
  generateReactHelpers,
} from '@uploadthing/react';
import type { CrashlabFileRouter } from '@/app/api/uploadthing/core';

export const UploadButton = generateUploadButton<CrashlabFileRouter>();
export const UploadDropzone = generateUploadDropzone<CrashlabFileRouter>();
export const { useUploadThing } = generateReactHelpers<CrashlabFileRouter>();
