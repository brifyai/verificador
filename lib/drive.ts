import { google } from 'googleapis';

export const getOAuth2Client = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Google OAuth credentials (CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

export const getDriveClient = (refreshToken: string) => {
  const auth = getOAuth2Client();
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth });
};

export const createDriveFolder = async (folderName: string, parentId: string, refreshToken: string) => {
  const drive = getDriveClient(refreshToken);
  const fileMetadata: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };

  if (parentId) {
    fileMetadata.parents = [parentId];
  }

  try {
    const file = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id',
    });
    return file.data.id;
  } catch (err) {
    console.error('Error creating Drive folder:', err);
    throw err;
  }
};

export const listFiles = async (folderId: string, refreshToken: string) => {
  const drive = getDriveClient(refreshToken);
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and (mimeType contains 'audio/' or mimeType = 'application/mp3')`,
      fields: 'nextPageToken, files(id, name, webViewLink, createdTime, mimeType)',
      orderBy: 'createdTime desc',
      pageSize: 1000,
    });
    return res.data.files;
  } catch (err) {
    console.error('Error listing Drive files:', err);
    throw err;
  }
};

export const listFolders = async (folderId: string, refreshToken: string) => {
  const drive = getDriveClient(refreshToken);
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
      fields: 'nextPageToken, files(id, name, webViewLink, createdTime)',
      orderBy: 'name',
      pageSize: 1000,
    });
    return res.data.files;
  } catch (err) {
    console.error('Error listing Drive folders:', err);
    throw err;
  }
};

export const getFileStream = async (fileId: string, refreshToken: string) => {
  const drive = getDriveClient(refreshToken);
  try {
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    return res.data;
  } catch (err) {
    console.error('Error getting file stream:', err);
    throw err;
  }
};

export const deleteDriveFile = async (fileId: string, refreshToken: string) => {
  const drive = getDriveClient(refreshToken);
  try {
    await drive.files.delete({
      fileId,
    });
    return true;
  } catch (err) {
    console.error('Error deleting Drive file:', err);
    throw err;
  }
};
