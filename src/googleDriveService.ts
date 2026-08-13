/**
 * Turtle Social Media Application - Google Drive Synchronization Service (googleDriveService)
 * 
 * Provides client-side/server-side interface to connect to Google Drive
 * via secure Firebase OAuth and query the Google Drive REST API v3 directly.
 */

// Format raw bytes to human-readable binary weights (Bytes, KB, MB, GB)
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 Bytes";
  if (isNaN(bytes)) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const mappedIndex = i >= sizes.length ? sizes.length - 1 : i;
  return parseFloat((bytes / Math.pow(k, mappedIndex)).toFixed(dm)) + " " + sizes[mappedIndex];
}

// Escapes single quotes inside Google Drive query strings to prevent injection
export function escapeQueryString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string; // Human-readable via formatBytes
  rawSize?: number;
  thumbnailLink?: string;
  webViewLink?: string;
  iconLink?: string;
  createdTime?: string;
}

/**
 * Initiates the client OAuth flow using Firebase Authentication client protocols.
 * Requests the scoped read-only permission path: https://www.googleapis.com/auth/drive.readonly
 */
export async function authenticateGoogleDrive(firebaseAuthInstance: any, googleAuthProviderClass: any): Promise<string> {
  const provider = new googleAuthProviderClass();
  provider.addScope("https://www.googleapis.com/auth/drive.readonly");

  try {
    const result = await firebaseAuthInstance.signInWithPopup(provider);
    const credential = googleAuthProviderClass.credentialFromResult(result);
    const token = credential?.accessToken;
    if (!token) {
      throw new Error("Failed to retrieve Google OAuth access token from credential result.");
    }
    return token;
  } catch (error: any) {
    console.error("Firebase Google Auth popup error:", error);
    throw error;
  }
}

/**
 * Directly queries the Google Drive API v3, applying custom filtering
 * to exclude folder nodes and discarded assets.
 */
export async function fetchGoogleDriveFiles(
  accessToken: string,
  searchQuery: string = ""
): Promise<GoogleDriveFile[]> {
  try {
    // Construct the exclusionary query
    let q = "mimeType != 'application/vnd.google-apps.folder' and trashed = false";
    if (searchQuery.trim()) {
      const escaped = escapeQueryString(searchQuery.trim());
      q += ` and name contains '${escaped}'`;
    }

    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.append("q", q);
    url.searchParams.append("fields", "files(id, name, mimeType, size, thumbnailLink, webViewLink, iconLink, createdTime)");
    url.searchParams.append("pageSize", "30");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      throw new Error(errorJson?.error?.message || `Google Drive API error: ${response.statusText}`);
    }

    const data = await response.json();
    const files = (data.files || []) as any[];

    return files.map(file => {
      const rawSize = file.size ? parseInt(file.size, 10) : undefined;
      return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        rawSize,
        size: rawSize !== undefined ? formatBytes(rawSize) : "Unknown Size",
        thumbnailLink: file.thumbnailLink,
        webViewLink: file.webViewLink,
        iconLink: file.iconLink,
        createdTime: file.createdTime
      };
    });
  } catch (err: any) {
    console.error("fetchGoogleDriveFiles API error:", err);
    throw err;
  }
}

/**
 * Highly realistic simulated fallback drive sync service to run smoothly in standard demo environments
 * without needing real Firebase deployment.
 */
export function getMockGoogleDriveFiles(searchQuery: string = ""): GoogleDriveFile[] {
  const mockFiles: GoogleDriveFile[] = [
    {
      id: "gdrive-1",
      name: "swiss_design_grid_template.png",
      mimeType: "image/png",
      rawSize: 1840000,
      size: formatBytes(1840000),
      thumbnailLink: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=150",
      webViewLink: "https://drive.google.com/open?id=mock-gdrive-1",
      iconLink: "https://ssl.gstatic.com/docs/doclist/images/icon_11_image_list.png",
      createdTime: "2026-07-04T12:00:00Z"
    },
    {
      id: "gdrive-2",
      name: "turtle_architecture_scoping.pdf",
      mimeType: "application/pdf",
      rawSize: 15400000,
      size: formatBytes(15400000),
      webViewLink: "https://drive.google.com/open?id=mock-gdrive-2",
      iconLink: "https://ssl.gstatic.com/docs/doclist/images/icon_12_pdf_list.png",
      createdTime: "2026-07-03T15:30:00Z"
    },
    {
      id: "gdrive-3",
      name: "evening_golden_hour_view.jpg",
      mimeType: "image/jpeg",
      rawSize: 4250000,
      size: formatBytes(4250000),
      thumbnailLink: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=150",
      webViewLink: "https://drive.google.com/open?id=mock-gdrive-3",
      iconLink: "https://ssl.gstatic.com/docs/doclist/images/icon_11_image_list.png",
      createdTime: "2026-07-04T18:45:00Z"
    },
    {
      id: "gdrive-4",
      name: "decentralized_slow_living_draft.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      rawSize: 245000,
      size: formatBytes(245000),
      webViewLink: "https://drive.google.com/open?id=mock-gdrive-4",
      iconLink: "https://ssl.gstatic.com/docs/doclist/images/icon_11_word_list.png",
      createdTime: "2026-07-01T10:15:00Z"
    },
    {
      id: "gdrive-5",
      name: "nature_sounds_ambient_loop.mp3",
      mimeType: "audio/mp3",
      rawSize: 45800000,
      size: formatBytes(45800000),
      webViewLink: "https://drive.google.com/open?id=mock-gdrive-5",
      iconLink: "https://ssl.gstatic.com/docs/doclist/images/icon_11_audio_list.png",
      createdTime: "2026-06-28T08:00:00Z"
    }
  ];

  if (!searchQuery.trim()) return mockFiles;

  const escapedQuery = searchQuery.trim().toLowerCase();
  return mockFiles.filter(f => f.name.toLowerCase().includes(escapedQuery));
}
