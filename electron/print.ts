import { BrowserWindow, dialog, app, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { PaperProfile } from './services/documents';

/**
 * Print + PDF engine.
 * Preview / print / PDF all render the SAME built HTML:
 *  - print: hidden window → webContents.print() → native Windows print dialog
 *  - pdf:   hidden window → webContents.printToPDF()
 *  - pages: measured from the render to power the preview's page counter
 */

const MM2IN = 1 / 25.4;

function makeWindow(p: PaperProfile): BrowserWindow {
  const w = Math.max(300, Math.round((p.widthMm / MM2IN) * 96));
  const h = Math.max(400, Math.round(((p.heightMm ?? 297) / MM2IN) * 96));
  const win = new BrowserWindow({
    show: false,
    width: w,
    height: h,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      javascript: true,
    },
  });
  win.setMenuBarVisibility(false);
  return win;
}

async function loadHtml(win: BrowserWindow, html: string): Promise<void> {
  // write to a temp file so relative/absolute file references (fonts as data URLs are
  // inlined) and Chromium's print pipeline behave identically to on-disk pages
  const dir = mkdtempSync(path.join(tmpdir(), 'dentiva-doc-'));
  const file = path.join(dir, 'doc.html');
  writeFileSync(file, html, 'utf8');
  try {
    await win.loadFile(file);
  } finally {
    // keep file alive until print done; cleanup on window close is handled by caller
  }
}

export async function measurePages(p: PaperProfile, html: string): Promise<number> {
  if (p.heightMm === null) return 1; // continuous roll
  const win = makeWindow(p);
  try {
    await loadHtml(win, html);
    const metrics = await win.webContents.executeJavaScript(`
      (() => {
        const cs = getComputedStyle(document.body);
        const height = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        );
        const contentHeightMm = ${p.heightMm} - ${p.marginTopMm} - ${p.marginBottomMm};
        const pxPerMm = 96 / 25.4;
        const pages = Math.ceil((height - parseFloat(cs.marginTop || '0') - parseFloat(cs.marginBottom || '0')) / (contentHeightMm * pxPerMm) + 0.0001);
        return Math.max(1, pages);
      })()
    `) as number;
    return metrics;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

function withScale(p: PaperProfile, html: string): string {
  if (!p.scale || p.scale === 100) return html;
  const z = (p.scale / 100).toString();
  return html.replace('</head>', `<style>html, body { zoom: ${z}; }</style></head>`);
}

export async function printDocument(p: PaperProfile, html: string, title: string): Promise<'printed' | 'cancelled'> {
  const win = makeWindow(p);
  try {
    await loadHtml(win, withScale(p, html));
    // give the layout a moment to settle (fonts)
    await new Promise((r) => setTimeout(r, 250));
    const landscape = p.orientation === 'landscape';
    const result = await new Promise<'printed' | 'cancelled'>((resolve) => {
      win.webContents.print(
        {
          silent: false,
          printBackground: true,
          landscape,
          pageSize: {
            width: p.widthMm * MM2IN,
            height: (p.heightMm ?? 297) * MM2IN,
          },
          margins: {
            top: p.marginTopMm * MM2IN,
            bottom: p.marginBottomMm * MM2IN,
            left: p.marginLeftMm * MM2IN,
            right: p.marginRightMm * MM2IN,
          },
        },
        (success, reason) => resolve(success && !reason ? 'printed' : 'cancelled'),
      );
    });
    void title;
    return result;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

export async function savePdf(p: PaperProfile, html: string, defaultName: string): Promise<string | null> {
  const win = makeWindow(p);
  try {
    await loadHtml(win, withScale(p, html));
    await new Promise((r) => setTimeout(r, 250));
    const landscape = p.orientation === 'landscape';
    const pdf = await win.webContents.printToPDF({
      landscape,
      pageSize: {
        width: p.widthMm * MM2IN,
        height: (p.heightMm ?? 297) * MM2IN,
      },
      printBackground: true,
      margins: {
        top: p.marginTopMm * MM2IN,
        bottom: p.marginBottomMm * MM2IN,
        left: p.marginLeftMm * MM2IN,
        right: p.marginRightMm * MM2IN,
      },
      displayHeaderFooter: false,
    });
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save as PDF',
      defaultPath: path.join(app.getPath('documents'), defaultName.endsWith('.pdf') ? defaultName : `${defaultName}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, pdf);
    return filePath;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

export function exportCsvToFile(defaultName: string, csv: string): Promise<string | null> {
  return dialog.showSaveDialog({
    title: 'Export CSV',
    defaultPath: path.join(app.getPath('documents'), defaultName.endsWith('.csv') ? defaultName : `${defaultName}.csv`),
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  }).then(({ canceled, filePath }) => {
    if (canceled || !filePath) return null;
    writeFileSync(filePath, '\uFEFF' + csv, 'utf8');
    return filePath;
  });
}

export function pickFolder(title: string): Promise<string | null> {
  return dialog.showOpenDialog({ title, properties: ['openDirectory', 'createDirectory'] }).then(({ canceled, filePaths }) =>
    canceled || !filePaths.length ? null : filePaths[0],
  );
}

export function pickFile(title: string, filters?: Electron.FileFilter[]): Promise<string | null> {
  return dialog.showOpenDialog({ title, properties: ['openFile'], filters }).then(({ canceled, filePaths }) =>
    canceled || !filePaths.length ? null : filePaths[0],
  );
}

export async function openItem(filePath: string): Promise<{ ok: boolean; error?: string }> {
  const err = await shell.openPath(filePath);
  return err ? { ok: false, error: err } : { ok: true };
}
