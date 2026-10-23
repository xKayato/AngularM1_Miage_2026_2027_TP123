import fsPromises from "node:fs/promises";

// Limites individuelles par famille
export const LIMITS_BY_FAMILY = {
  image: 5 * 1024 * 1024,  // 5 Mo
  pdf: 10 * 1024 * 1024,   // 10 Mo
  audio: 25 * 1024 * 1024, // 25 Mo
};

export const MAX_ATTACHMENTS_PER_POST = 10;
export const MAX_CUMULATIVE_BYTES_PER_POST = 50 * 1024 * 1024; // 50 Mo

/**
 * Valide le contenu binaire réel d'un fichier à partir de ses premiers octets (magic bytes).
 * Ne se fie pas à l'extension ni au Content-Type déclaré par le client.
 *
 * Formats supportés et signatures :
 * - Image : JPEG (FF D8 FF), PNG (89 50 4E 47 0D 0A 1A 0A), WebP (RIFF....WEBP)
 * - PDF   : %PDF- (25 50 44 46 2D)
 * - Audio : WAV (RIFF....WAVE), OGG (OggS), M4A (ftyp), MP3 (ID3 ou frame sync 0xFFE0)
 *
 * @param {string} filePath - Chemin absolu du fichier temporaire sur disque
 * @param {number} size - Taille en octets du fichier
 * @param {string} originalName - Nom de fichier d'origine
 * @returns {Promise<{ isValid: boolean, error?: string, mimeType?: string, family?: 'image' | 'audio' | 'pdf' }>}
 */
export async function detectAndValidateAttachment(filePath, size, originalName) {
  if (typeof size === "number") {
    if (size <= 0) {
      return {
        isValid: false,
        error: `Fichier trop court ou vide pour '${originalName}'`,
      };
    }
    if (size > LIMITS_BY_FAMILY.audio) {
      return {
        isValid: false,
        error: `Le fichier '${originalName}' dépasse la taille maximale autorisée (25 Mo).`,
      };
    }
  }

  let handle;
  try {
    handle = await fsPromises.open(filePath, "r");
    const buffer = Buffer.allocUnsafe(32);
    const { bytesRead } = await handle.read(buffer, 0, 32, 0);

    if (bytesRead < 4) {
      return {
        isValid: false,
        error: `Fichier trop court ou vide pour '${originalName}'`,
      };
    }

    let mimeType = null;
    let family = null;

    // 1. DÉTECTION IMAGE
    // JPEG : FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      mimeType = "image/jpeg";
      family = "image";
    }
    // PNG : 89 50 4E 47 0D 0A 1A 0A
    else if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      mimeType = "image/png";
      family = "image";
    }
    // WebP : RIFF....WEBP
    else if (
      bytesRead >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
      mimeType = "image/webp";
      family = "image";
    }

    // 2. DÉTECTION PDF
    // PDF : %PDF- (25 50 44 46 2D)
    else if (bytesRead >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") {
      mimeType = "application/pdf";
      family = "pdf";
    }

    // 3. DÉTECTION AUDIO
    // WAV : RIFF....WAVE
    else if (
      bytesRead >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WAVE"
    ) {
      mimeType = "audio/wav";
      family = "audio";
    }
    // OGG : OggS (4F 67 67 53)
    else if (buffer.toString("ascii", 0, 4) === "OggS") {
      mimeType = "audio/ogg";
      family = "audio";
    }
    // M4A / MP4 Audio : conteneur ISO avec ftyp aux octets 4-7
    else if (
      bytesRead >= 8 &&
      buffer.toString("ascii", 4, 8) === "ftyp"
    ) {
      mimeType = "audio/mp4";
      family = "audio";
    }
    // MP3 : tag ID3 (49 44 33) ou Frame Sync MPEG (11 bits consécutifs à 1 : 0xFFEx)
    else if (
      (buffer.toString("ascii", 0, 3) === "ID3") ||
      (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0 && (buffer[1] & 0x18) !== 0x08 && (buffer[1] & 0x06) !== 0x00)
    ) {
      mimeType = "audio/mpeg";
      family = "audio";
    }

    // Format non reconnu parmi les familles autorisées
    if (!mimeType || !family) {
      return {
        isValid: false,
        error: `Format de fichier non accepté ou contenu altéré pour '${originalName}'. Formats acceptés : JPEG, PNG, WebP, PDF, MP3, WAV, OGG, M4A.`,
      };
    }

    // Contrôle de la limite de taille individuelle par famille
    const maxAllowedBytes = LIMITS_BY_FAMILY[family];
    if (size > maxAllowedBytes) {
      const maxMo = maxAllowedBytes / (1024 * 1024);
      return {
        isValid: false,
        error: `Le fichier '${originalName}' (${(size / (1024 * 1024)).toFixed(1)} Mo) dépasse la taille maximale autorisée pour sa catégorie (${family}: max ${maxMo} Mo).`,
      };
    }

    return {
      isValid: true,
      mimeType,
      family,
    };
  } catch (err) {
    return {
      isValid: false,
      error: `Erreur lors de la lecture du fichier '${originalName}': ${err.message}`,
    };
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {}
    }
  }
}
