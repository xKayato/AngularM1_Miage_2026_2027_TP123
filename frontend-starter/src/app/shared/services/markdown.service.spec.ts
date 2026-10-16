import { describe, it, expect, beforeEach } from 'vitest';
import { MarkdownService, escapeHtml } from './markdown.service';
import { AttachmentInfo } from '../models/post.model';

describe('MarkdownService (Mission 3 — Rendu Markdown Sécurisé)', () => {
  let service: MarkdownService;

  const mockAttachments: AttachmentInfo[] = [
    {
      id: 'att-img-1',
      originalName: 'schema-montage.png',
      mimeType: 'image/png',
      size: 1048576,
      family: 'image',
      downloadUrl: '/api/posts/p1/attachments/att-img-1',
      isCover: true,
    },
    {
      id: 'att-pdf-1',
      originalName: 'notice.pdf',
      mimeType: 'application/pdf',
      size: 2097152,
      family: 'pdf',
      downloadUrl: '/api/posts/p1/attachments/att-pdf-1',
      isCover: false,
    },
    {
      id: 'att-audio-1',
      originalName: 'ambiance.mp3',
      mimeType: 'audio/mpeg',
      size: 5242880,
      family: 'audio',
      downloadUrl: '/api/posts/p1/attachments/att-audio-1',
      isCover: false,
    },
  ];

  beforeEach(() => {
    service = new MarkdownService();
  });

  describe('Fonction escapeHtml', () => {
    it('neutralise les balises HTML et caractères spéciaux', () => {
      const input = '<script>alert("XSS") & test\'s</script>';
      const escaped = escapeHtml(input);
      expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS&quot;) &amp; test&#39;s&lt;/script&gt;');
    });
  });

  describe('Sécurité absolue : Aucun HTML brut exécutable', () => {
    it('échappe les balises <script> et empêche toute injection de script', () => {
      const md = 'Texte avant <script>alert("danger")</script> texte après';
      const result = service.render(md);
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('neutralise les gestionnaires d\'événements dangereux comme onerror ou onclick', () => {
      const md = '<img src="x" onerror="alert(1)" onclick="hack()" />';
      const result = service.render(md);
      expect(result).not.toContain('<img src="x"');
      expect(result).toContain('&lt;img src=&quot;x&quot;');
    });

    it('neutralise les balises <iframe>, <object> et <embed>', () => {
      const md = '<iframe src="https://evil.com"></iframe><object data="test.swf"></object>';
      const result = service.render(md);
      expect(result).not.toContain('<iframe');
      expect(result).not.toContain('<object');
      expect(result).toContain('&lt;iframe');
      expect(result).toContain('&lt;object');
    });
  });

  describe('Sécurité des liens (Protocoles autorisés uniquement)', () => {
    it('autorise les liens HTTPS valides avec rel="noopener noreferrer" et target="_blank"', () => {
      const md = 'Consultez la [documentation officielle](https://angular.dev).';
      const result = service.render(md);
      expect(result).toContain('<a href="https://angular.dev" target="_blank" rel="noopener noreferrer" class="tutorial-link">documentation officielle ↗</a>');
    });

    it('autorise les liens mailto:', () => {
      const md = 'Contactez-moi par [email](mailto:contact@makershare.local).';
      const result = service.render(md);
      expect(result).toContain('<a href="mailto:contact@makershare.local" target="_blank" rel="noopener noreferrer" class="tutorial-link">email ↗</a>');
    });

    it('interdit formellement les liens javascript: et les rend inoffensifs', () => {
      const md = 'Cliquez sur ce [lien piégé](javascript:alert("XSS")).';
      const result = service.render(md);
      expect(result).not.toContain('<a href="javascript:');
      expect(result).toContain('<span class="unsafe-link">lien piégé</span>');
    });

    it('interdit les liens data: et les neutralise', () => {
      const md = '[Payload](data:text/html,<script>alert(1)</script>)';
      const result = service.render(md);
      expect(result).not.toContain('<a href="data:');
      expect(result).toContain('<span class="unsafe-link">Payload</span>');
    });
  });

  describe('Images intégrées (Pièces jointes accessibles uniquement)', () => {
    it('résout une image valide par son token attachment:<id>', () => {
      const md = '![Schéma du circuit](attachment:att-img-1)';
      const result = service.render(md, mockAttachments);
      expect(result).toContain('<img src="/api/posts/p1/attachments/att-img-1" alt="Schéma du circuit" class="tutorial-inline-image" loading="lazy" />');
      expect(result).toContain('<figcaption class="tutorial-image-caption">Schéma du circuit</figcaption>');
    });

    it('résout une image par son nom d\'origine via le format Figma in-text', () => {
      const md = '[📎 PIÈCE JOINTE DANS LE TEXTE : schema-montage.png]';
      const result = service.render(md, mockAttachments);
      expect(result).toContain('<img src="/api/posts/p1/attachments/att-img-1" alt="schema-montage.png"');
    });

    it('affiche un statut propre pour une pièce jointe non trouvée sans créer de balise <img> cassée', () => {
      const md = '![Image manquante](attachment:introuvable-999)';
      const result = service.render(md, mockAttachments);
      expect(result).not.toContain('<img');
      expect(result).toContain('[Image externe non autorisée : Image manquante]');
    });

    it('interdit les images externes pour bloquer le pistage et les fuites IP', () => {
      const md = '![Tracker](https://evil-analytics.com/pixel.png)';
      const result = service.render(md, mockAttachments);
      expect(result).not.toContain('<img src="https://evil-analytics.com');
      expect(result).toContain('[Image externe non autorisée : Tracker]');
    });

    it('affiche un placeholder soigné pour une image locale temporaire en attente de sauvegarde', () => {
      const md = '![Montage](attachment:temp:temp-img-1)';
      const result = service.render(md, mockAttachments);
      expect(result).toContain('<figure class="tutorial-inline-image-box temp-pending">');
      expect(result).toContain("Image en attente d'enregistrement");
      expect(result).toContain('Montage');
    });
  });

  describe('Pièces jointes riches (PDF, Audio, Archive & Liens in-text)', () => {
    it('génère un lien de téléchargement accessible pour un document PDF via token attachment:<id>', () => {
      const md = 'Consultez la [Notice technique](attachment:att-pdf-1) pour démarrer.';
      const result = service.render(md, mockAttachments);
      expect(result).toContain('<a href="/api/posts/p1/attachments/att-pdf-1" target="_blank" rel="noopener noreferrer" class="tutorial-attachment-link tutorial-pdf-link" download="notice.pdf">');
      expect(result).toContain('Notice technique');
      expect(result).toContain('2.0 Mo');
    });

    it('génère un bloc lecteur audio intégré pour un fichier audio via token attachment:<id>', () => {
      const md = 'Écoutez le son : [Exemple sonore](attachment:att-audio-1)';
      const result = service.render(md, mockAttachments);
      expect(result).toContain('<div class="tutorial-inline-audio-box">');
      expect(result).toContain('<span class="audio-title">Exemple sonore</span>');
      expect(result).toContain('<audio controls src="/api/posts/p1/attachments/att-audio-1"');
    });

    it('affiche un badge en attente pour un lien de pièce jointe temporaire', () => {
      const md = 'Téléchargez [Fichier en cours](attachment:temp:temp-file-2)';
      const result = service.render(md, mockAttachments);
      expect(result).toContain('<span class="intext-temp-badge">');
      expect(result).toContain('Fichier en cours');
      expect(result).toContain("Pièce jointe en attente d'enregistrement");
    });

    it('affiche un message d\'erreur sécurisé pour un lien pointant vers une pièce jointe inexistante', () => {
      const md = 'Voir [Document supprimé](attachment:att-deleted-99)';
      const result = service.render(md, mockAttachments);
      expect(result).toContain('<span class="intext-attachment-box missing">');
      expect(result).toContain('Document supprimé');
      expect(result).toContain('[Fichier non disponible]');
    });
  });

  describe('Formatage Markdown standard', () => {
    it('formate les titres H1, H2, H3', () => {
      const md = '# Titre 1\n## Titre 2\n### Titre 3';
      const result = service.render(md);
      expect(result).toContain('<h2 class="tutorial-h2 font-display">Titre 1</h2>');
      expect(result).toContain('<h3 class="tutorial-h3 font-display">Titre 2</h3>');
      expect(result).toContain('<h4 class="tutorial-h4 font-display">Titre 3</h4>');
    });

    it('formate le gras, l\'italique et le souligné', () => {
      const md = 'Du texte en **gras** et en *italique* et __souligné__.';
      const result = service.render(md);
      expect(result).toContain('<strong>gras</strong>');
      expect(result).toContain('<em>italique</em>');
      expect(result).toContain('<u>souligné</u>');
    });

    it('formate les blocs de code multilignes', () => {
      const md = '```typescript\nconst x: number = 42;\nconsole.log(x);\n```';
      const result = service.render(md);
      expect(result).toContain('<pre class="tutorial-code-block"><code class="language-typescript">const x: number = 42;\nconsole.log(x);</code></pre>');
    });

    it('formate les citations', () => {
      const md = '> Toujours vérifier l\'alignement.';
      const result = service.render(md);
      expect(result).toContain('<blockquote class="tutorial-quote">💡 Toujours vérifier l&#39;alignement.</blockquote>');
    });

    it('formate les listes à puces et listes ordonnées', () => {
      const md = '- Étape A\n- Étape B\n\n1. Premier\n2. Deuxième';
      const result = service.render(md);
      expect(result).toContain('<ul class="tutorial-list"><li>Étape A</li><li>Étape B</li></ul>');
      expect(result).toContain('<ol class="tutorial-ordered-list"><li>Premier</li><li>Deuxième</li></ol>');
    });
  });
});
