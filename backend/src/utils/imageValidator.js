import fsPromises from "node:fs/promises";

/**
 * Valide le contenu binaire réel d'un fichier image à partir de ses octets magiques (magic numbers).
 * Ne se fie pas uniquement à l'extension ni au Content-Type déclaré par le client.
 * Formats acceptés : JPEG, PNG, WebP.
 * 
 * @param {string} filePath - Chemin absolu ou relatif vers le fichier sur disque
 * @returns {Promise<"image/jpeg" | "image/png" | "image/webp" | null>} Type MIME réel ou null si invalide
 */
export async function detectRealImageMime(filePath) {
  let handle;
  try {
    handle = await fsPromises.open(filePath, "r");
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, 16, 0);

    if (bytesRead < 12) {
      return null;
    }

    // JPEG : commence par FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }

    // PNG : signature standard 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return "image/png";
    }

    // WebP : conteneur RIFF (octets 0-3 = "RIFF", octets 8-11 = "WEBP")
    if (
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
      return "image/webp";
    }

    return null;
  } catch (error) {
    console.error("[imageValidator] Impossible de lire le fichier pour détection", error);
    return null;
  } finally {
    if (handle) {
      await handle.close();
    }
  }
}
