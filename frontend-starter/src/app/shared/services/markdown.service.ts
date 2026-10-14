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

      // Résolution par token attachment:<id> ou nom direct
      let targetAtt: AttachmentInfo | undefined;
      if (src.startsWith('attachment:')) {
        const attId = src.replace(/^attachment:/, '').trim();
        targetAtt = attachments.find((a) => a.id === attId);
      } else {
        targetAtt = attachments.find((a) => a.id === src || a.originalName === src);
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

      // Rejet formel des URLs d'images externes pour éviter pistage, XSS et failles SSRF
      return `<span class="inline-image-external">[Image externe non autorisée : ${alt}]</span>`;
    });

    // 5. Traiter les liens Markdown : [texte](url)
    // Sécurité stricte : Protocoles limités à http:, https: et mailto:
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, rawText, rawHref) => {
      const linkText = rawText.trim();
      const href = rawHref.trim();

      // Détection des protocoles interdits (javascript:, data:, vbscript:, etc.)
      // Note: href a déjà subi escapeHtml, donc '&' peut être '&amp;'
      const decodedHref = href.replace(/&amp;/g, '&');
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
