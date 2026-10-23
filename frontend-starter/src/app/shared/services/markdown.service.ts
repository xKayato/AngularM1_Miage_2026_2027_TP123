import { Injectable } from '@angular/core';
import { AttachmentInfo } from '../models/post.model';

export function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ALLOWED_PROTOCOLS = /^(https?:|mailto:)/i;

@Injectable({
  providedIn: 'root',
})
export class MarkdownService {
  /**
   * Rendu sécurisé d'un texte Markdown en HTML :
   * 1. Échappement préalable strict de tout HTML brut utilisateur (aucun risque XSS).
   * 2. Traduction des structures Markdown (titres, gras, italique, citations, listes, code).
   * 3. Liens limités aux protocoles autorisés (http:, https:, mailto:) avec rel="noopener noreferrer".
   * 4. Images intégrées résolues UNIQUEMENT depuis des pièces jointes accessibles du post.
   *    (Les images externes ou protocoles non autorisés sont neutralisés sans balise <img>).
   * 5. Aucun bypassSecurityTrustHtml n'est requis ni appliqué.
   */
  render(
    markdown: string,
    attachments: AttachmentInfo[] = [],
    getAttachmentUrl?: (att: AttachmentInfo) => string | null,
  ): string {
    if (!markdown || !markdown.trim()) {
      return '';
    }

    // 1. Échappement HTML préalable systématique
    let text = escapeHtml(markdown.trim());

    // 2. Extraire et protéger les blocs de code multilignes ```...```
    const codeBlocks: string[] = [];
    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      const langClass = lang ? ` class="language-${lang.trim()}"` : '';
      codeBlocks.push(`<pre class="tutorial-code-block"><code${langClass}>${code.trim()}</code></pre>`);
      return `@@CODE_BLOCK_${idx}@@`;
    });

    // 3. Traiter les repères de pièces jointes au fil du texte Figma v2 :
    // [📎 PIÈCE JOINTE DANS LE TEXTE : filename (meta)]
    text = text.replace(
      /\[📎 PIÈCE JOINTE DANS LE TEXTE : ([^\]\()]+)(?:\s*\(([^)]*)\))?\]/g,
      (_, filename, meta) => {
        const cleanName = filename.trim();
        const found = attachments.find(
          (a) => a.originalName.toLowerCase() === cleanName.toLowerCase(),
        );

        if (!found) {
          return `<div class="intext-attachment-box missing"><span class="intext-badge">PJ</span><span class="intext-name">${cleanName}</span> <span class="intext-status">[Fichier non disponible]</span></div>`;
        }

        const resolvedUrl = getAttachmentUrl ? getAttachmentUrl(found) : found.downloadUrl;
        if (found.family === 'image' && resolvedUrl) {
          return `<figure class="tutorial-inline-image-box"><img src="${resolvedUrl}" alt="${cleanName}" class="tutorial-inline-image" loading="lazy" /><figcaption class="tutorial-image-caption">🖼️ ${cleanName}</figcaption></figure>`;
        }

        const icon = found.family === 'pdf' ? '📄' : found.family === 'audio' ? '🎵' : '📎';
        return `<div class="intext-attachment-box"><span class="intext-badge">${found.family.toUpperCase()}</span><div class="intext-info"><span class="intext-title">${icon} ${cleanName}</span><span class="intext-desc">${meta ? meta : this.formatBytes(found.size)}</span></div></div>`;
      },
    );

    // 4. Traiter les images Markdown standard : ![alt](src)
    // Sécurité stricte : autorisées UNIQUEMENT si résolues depuis une pièce jointe accessible !
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, rawAlt, rawSrc) => {
      const alt = rawAlt.trim() || 'Image du tutoriel';
      const src = rawSrc.trim();

      // Résolution par token attachment:<id>, attachment:temp:<id>, ou nom direct
      let targetAtt: AttachmentInfo | undefined;
      const cleanAlt = alt.toLowerCase();

      if (src.startsWith('attachment:temp:')) {
        const tempToken = src.replace(/^attachment:temp:/, '').trim();
        targetAtt = attachments.find(
          (a) => a.id === tempToken || (a as any).tempId === tempToken || a.originalName.toLowerCase() === cleanAlt,
        );
      } else if (src.startsWith('attachment:')) {
        const attId = src.replace(/^attachment:/, '').trim();
        targetAtt = attachments.find(
          (a) => a.id === attId || a.originalName.toLowerCase() === attId.toLowerCase(),
        );
      } else {
        targetAtt = attachments.find(
          (a) => a.id === src || a.originalName.toLowerCase() === src.toLowerCase(),
        );
      }

      // Repli si non trouvé : tenter de matcher par le nom indiqué dans l'alt
      if (!targetAtt && alt) {
        targetAtt = attachments.find((a) => a.originalName.toLowerCase() === cleanAlt);
      }

      if (targetAtt) {
        if (targetAtt.family === 'image') {
          const resolvedUrl = getAttachmentUrl ? getAttachmentUrl(targetAtt) : targetAtt.downloadUrl;
          if (resolvedUrl) {
            return `<figure class="tutorial-inline-image-box"><img src="${resolvedUrl}" alt="${alt}" class="tutorial-inline-image" loading="lazy" /><figcaption class="tutorial-image-caption">${alt}</figcaption></figure>`;
          }
        }
        return `<div class="intext-attachment-box"><span class="intext-badge">${targetAtt.family.toUpperCase()}</span><span class="intext-title">${targetAtt.originalName} (${this.formatBytes(targetAtt.size)})</span></div>`;
      }

      // Si c'est un jeton temporaire sans URL locale résolue
      if (src.startsWith('attachment:temp:')) {
        return `<figure class="tutorial-inline-image-box temp-pending"><div class="temp-image-placeholder"><span class="temp-icon">🖼️</span> <span class="temp-image-name">${alt}</span> <span class="temp-badge">[Image en attente d'enregistrement]</span></div><figcaption class="tutorial-image-caption">${alt}</figcaption></figure>`;
      }

      // Rejet formel des URLs d'images externes pour éviter pistage, XSS et failles SSRF
      return `<span class="inline-image-external">[Image externe non autorisée : ${alt}]</span>`;
    });

    // 5. Traiter les liens Markdown : [texte](url)
    // Sécurité stricte : Protocoles limités à http:, https:, mailto:, et attachment:
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, rawText, rawHref) => {
      const linkText = rawText.trim();
      const href = rawHref.trim();
      const decodedHref = href.replace(/&amp;/g, '&');

      // 5.a. Résolution des pièces jointes sous forme de lien ou bloc in-text : attachment:<id> ou attachment:temp:<id>
      if (decodedHref.startsWith('attachment:')) {
        let targetAtt: AttachmentInfo | undefined;

        if (decodedHref.startsWith('attachment:temp:')) {
          const tempToken = decodedHref.replace(/^attachment:temp:/, '').trim();
          targetAtt = attachments.find(
            (a) => a.id === tempToken || (a as any).tempId === tempToken || a.originalName.toLowerCase() === linkText.toLowerCase(),
          );
          if (!targetAtt) {
            return `<span class="intext-temp-badge"><span class="badge-icon">⏳</span> <span class="badge-name">${linkText}</span> <span class="badge-hint">[Pièce jointe en attente d'enregistrement]</span></span>`;
          }
        } else {
          const attId = decodedHref.replace(/^attachment:/, '').trim();
          targetAtt = attachments.find(
            (a) => a.id === attId || a.originalName.toLowerCase() === attId.toLowerCase() || a.originalName.toLowerCase() === linkText.toLowerCase(),
          );
        }

        if (targetAtt) {
          const resolvedUrl = getAttachmentUrl ? getAttachmentUrl(targetAtt) : targetAtt.downloadUrl;
          if (targetAtt.family === 'pdf') {
            return `<a href="${resolvedUrl || '#'}" target="_blank" rel="noopener noreferrer" class="tutorial-attachment-link tutorial-pdf-link" download="${targetAtt.originalName}"><span class="link-icon">📄</span> <span class="link-label">${linkText}</span> <span class="link-meta">(${this.formatBytes(targetAtt.size)})</span> ↗</a>`;
          }
          if (targetAtt.family === 'audio') {
            return `<div class="tutorial-inline-audio-box"><div class="audio-header"><span class="audio-icon">🎵</span> <span class="audio-title">${linkText}</span> <span class="audio-size">(${this.formatBytes(targetAtt.size)})</span></div>${resolvedUrl ? `<audio controls src="${resolvedUrl}" preload="none" class="tutorial-audio-player"></audio>` : ''}</div>`;
          }
          if (targetAtt.family === 'image') {
            return `<a href="${resolvedUrl || '#'}" target="_blank" rel="noopener noreferrer" class="tutorial-attachment-link tutorial-image-link"><span class="link-icon">🖼️</span> <span class="link-label">${linkText}</span> <span class="link-meta">(${this.formatBytes(targetAtt.size)})</span> ↗</a>`;
          }
          return `<a href="${resolvedUrl || '#'}" target="_blank" rel="noopener noreferrer" class="tutorial-attachment-link" download="${targetAtt.originalName}"><span class="link-icon">📎</span> <span class="link-label">${linkText}</span> <span class="link-meta">(${this.formatBytes(targetAtt.size)})</span> ↗</a>`;
        }

        return `<span class="intext-attachment-box missing"><span class="intext-badge">PJ</span><span class="intext-name">${linkText}</span> <span class="intext-status">[Fichier non disponible]</span></span>`;
      }

      // 5.b. Liens web externes avec protocoles autorisés (http, https, mailto)
      if (ALLOWED_PROTOCOLS.test(decodedHref)) {
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="tutorial-link">${linkText} ↗</a>`;
      }

      // Protocole non autorisé : affichage en texte inoffensif sans lien cliquable
      return `<span class="unsafe-link">${linkText}</span>`;
    });

    // 6. Inline code `code`
    text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // 7. Gras **texte** et Italique *texte*
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/__([^_]+)__/g, '<u>$1</u>');

    // 8. Citations / Astuces d'atelier : > citation
    text = text.replace(/^&gt;\s*(.*)$/gm, '<blockquote class="tutorial-quote">💡 $1</blockquote>');

    // 9. Titres H1, H2, H3
    text = text.replace(/^###\s*(.*)$/gm, '<h4 class="tutorial-h4 font-display">$1</h4>');
    text = text.replace(/^##\s*(.*)$/gm, '<h3 class="tutorial-h3 font-display">$1</h3>');
    text = text.replace(/^#\s*(.*)$/gm, '<h2 class="tutorial-h2 font-display">$1</h2>');

    // 10. Filets horizontaux --- ou ***
    text = text.replace(/^(-{3,}|\*{3,})$/gm, '<hr class="tutorial-hr" />');

    // 11. Listes à puces (- item ou * item)
    text = text.replace(/(?:^[-*]\s+.*(?:\r?\n|$))+/gm, (listBlock) => {
      const items = listBlock
        .trim()
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-*]\s+/, '').trim())
        .filter((line) => line.length > 0)
        .map((line) => `<li>${line}</li>`)
        .join('');
      return `<ul class="tutorial-list">${items}</ul>`;
    });

    // 12. Listes numérotées (1. item)
    text = text.replace(/(?:^\d+\.\s+.*(?:\r?\n|$))+/gm, (listBlock) => {
      const items = listBlock
        .trim()
        .split(/\r?\n/)
        .map((line) => line.replace(/^\d+\.\s+/, '').trim())
        .filter((line) => line.length > 0)
        .map((line) => `<li>${line}</li>`)
        .join('');
      return `<ol class="tutorial-ordered-list">${items}</ol>`;
    });

    // 13. Paragraphes : regrouper les lignes de texte restantes
    const paragraphs = text
      .split(/(?:\r?\n){2,}/)
      .map((block) => block.trim())
      .filter((block) => block.length > 0)
      .map((block) => {
        // Si le bloc est déjà une balise de bloc (h2, h3, h4, ul, ol, blockquote, figure, hr, code block)
        if (
          /^<(?:h[2-4]|ul|ol|blockquote|figure|hr|div|pre)/i.test(block) ||
          block.startsWith('@@CODE_BLOCK_')
        ) {
          return block;
        }
        // Remplacer les sauts de ligne simples par <br />
        const inlineBreaks = block.replace(/\r?\n/g, '<br />');
        return `<p class="tutorial-p">${inlineBreaks}</p>`;
      });

    let result = paragraphs.join('\n');

    // 14. Réinsérer les blocs de code protégés
    codeBlocks.forEach((codeHtml, idx) => {
      result = result.replace(`@@CODE_BLOCK_${idx}@@`, codeHtml);
    });

    return result;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 o';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }
}
