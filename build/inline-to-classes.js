#!/usr/bin/env node
'use strict';
/* ============================================================
   AdvisorOS - inline style to shared-class converter
   Replaces exact static style="..." attribute values in the
   feature source files with the equivalent utility classes
   (defined in css/components.css "SHARED UTILITIES" block).

   Why this exists: feature screens used to carry ~580 inline
   styles, which bloated the templates, resisted dark-mode
   scoping (see core.css surface scoping), and were hard to
   theme consistently. The MAP below is the one-to-one
   translation table used for the one-shot migration; keeping
   it in build/ means new feature code that reintroduces a
   known pattern can be re-run through the same converter:

     node build/inline-to-classes.js            # apply, writes files
     node build/inline-to-classes.js --dry-run  # preview only, no writes

   It skips anything with ${...} (dynamic values that must stay
   inline) or display:none (JS toggles element.style directly).
   Deliberate leftovers are expected; see the file comment on
   the FILES list.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const MAP = {
  // ---- font size / weight / colour combos ----
  'font-size:16px;': 'fs-16',
  'font-size:18px;': 'fs-18',
  'font-size: 18px;': 'fs-18',
  'font-size:13px;': 'fs-13',
  'font-size: 13px;': 'fs-13',
  'font-size:12px;': 'fs-12',
  'font-size: 12px;': 'fs-12',
  'font-size:11px;': 'fs-11',
  'font-size: 10px;': 'fs-10',
  'font-size:10px;flex-shrink:0;': 'fs-10 shrink-0',
  'font-size: 40px; margin-bottom: 8px;': 'fs-40 mb-sm',
  'font-size: 26px; font-weight: 700; margin-bottom: 8px;': 'fs-26 fw-700 mb-sm',
  'font-size: 24px; font-weight: 700; text-align: center;': 'fs-24 fw-700 text-center',
  'font-size: 48px; margin-bottom: 8px;': 'fs-48 mb-sm',
  'font-size: 20px; font-weight: 600;': 'fs-20 fw-600',
  'font-size:22px;font-weight:800;': 'fs-22 fw-800',
  'font-size:20px;font-weight:700;color:var(--danger);': 'fs-20 fw-700 text-danger',
  'font-size:18px;font-weight:700;color:var(--danger);': 'fs-18 fw-700 text-danger',
  'font-size:16px;font-weight:600;color:var(--text-secondary);': 'fs-16 fw-600 text-secondary',
  'font-size:13px;font-weight:700;': 'fs-13 fw-700',
  'font-size:64px;color:var(--text-tertiary);margin-bottom:16px;': 'fs-64 text-tertiary mb-md',
  'font-size:32px;font-weight:700;margin-top:6px;': 'fs-32 fw-700 mt-6',
  'font-size:32px;color:var(--text-tertiary);': 'fs-32 text-tertiary',
  'font-size:15px;opacity:0.9;margin-top:4px;': 'fs-15 op-90 mt-xs',
  'font-size:13px;opacity:0.9;': 'fs-13 op-90',
  'font-size:13px;color:var(--primary);font-weight:600;': 'fs-13 text-brand fw-600',
  'font-size:12px;vertical-align:text-bottom;': 'fs-12 vtext-bottom',
  'font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:6px;': 'fs-12 fw-700 text-secondary mb-6',
  'font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px;': 'section-label',
  'font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;': 'fs-12 fw-600 text-secondary text-uppercase ls-05',
  'font-size: 12px; font-weight: 600; color: var(--warning); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;': 'fs-12 fw-600 text-warning text-uppercase ls-05 mb-sm',
  'font-size: 12px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;': 'fs-12 fw-600 text-tertiary text-uppercase ls-05 mb-sm',
  'font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; margin-top: 8px;': 'fs-12 fw-600 text-secondary text-uppercase ls-05 mb-sm mt-sm',
  'font-size: 12px; font-weight: 600; color: var(--danger); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;': 'fs-12 fw-600 text-danger text-uppercase ls-05 mb-sm',
  'font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px;': 'fs-11 ls-em05 text-uppercase text-secondary mb-sm',
  'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-tertiary);margin-bottom:4px;': 'fs-11 fw-700 text-uppercase ls-em04 text-tertiary mb-xs',
  'font-size:11px;opacity:0.7;margin-top:6px;': 'fs-11 op-70 mt-6',
  'font-size:11px;color:var(--text-tertiary);margin:4px 2px 0;': 'fs-11 text-tertiary mt-xs mx-2 mb-0',
  'font-size:11px;color:var(--text-tertiary);margin-top:4px;': 'fs-11 text-tertiary mt-xs',
  'font-size:11px;color:var(--text-tertiary);line-height:1.35;margin-top:8px;overflow-wrap:anywhere;': 'fs-11 text-tertiary lh-135 mt-sm ow-any',
  'font-size:11px;color:var(--secondary);margin-top:2px;': 'fs-11 text-success mt-2',
  'font-size:11px;color:var(--secondary);margin-top:6px;': 'fs-11 text-success mt-6',
  'font-size:11px;color:var(--secondary);margin-top:4px;': 'fs-11 text-success mt-xs',
  'font-size:10px;color:var(--text-tertiary);text-transform:uppercase;': 'fs-10 text-tertiary text-uppercase',
  'font-size:10px; padding: 2px 8px; flex-shrink: 0;': 'fs-10 pill-pad shrink-0',
  'font-size:10px;color:var(--text-tertiary);margin-top:4px;': 'fs-10 text-tertiary mt-xs',
  'font-size:12px;color:var(--warning,#b06000);text-align:center;padding-top:8px;': 'fs-12 text-warning text-center pt-sm',
  'font-size:12px;color:var(--warning,#b06000);margin-top:6px;': 'fs-12 text-warning mt-6',
  'font-size:12px;color:var(--secondary);text-align:center;padding-top:8px;': 'fs-12 text-success text-center pt-sm',
  'font-size:12px;color:var(--text-tertiary);text-align:center;margin:10px 0 4px;': 'fs-12 text-tertiary text-center mt-10 mb-xs',
  'font-size:12px;color:var(--text-tertiary);margin-top:6px;': 'fs-12 text-tertiary mt-6',
  'font-size:12px;color:var(--text-tertiary);margin-top:10px;text-align:center;': 'fs-12 text-tertiary mt-10 text-center',
  'font-size:12px;color:var(--text-tertiary);margin-top:10px;': 'fs-12 text-tertiary mt-10',
  'font-size:12px;color:var(--text-secondary);margin-top:4px;': 'fs-12 text-secondary mt-xs',
  'font-size:12px;color:var(--text-secondary);margin-top:10px;': 'fs-12 text-secondary mt-10',
  'font-size:12px;color:var(--text-secondary);margin-bottom:4px;': 'fs-12 text-secondary mb-xs',
  'font-size:12px;color:var(--text-secondary);line-height:1.45;': 'fs-12 text-secondary lh-145',
  'font-size: 14px; color: var(--text-secondary); white-space: pre-wrap;': 'fs-14 text-secondary prewrap',
  'font-size: 13px; color: var(--text-secondary); margin-top:2px;': 'fs-13 text-secondary mt-2',
  'font-size: 13px; color: var(--secondary);': 'fs-13 text-success',
  'font-size: 12px; color: var(--text-tertiary);': 'fs-12 text-tertiary',
  'font-size: 12px; color: var(--text-tertiary); text-align: center;': 'fs-12 text-tertiary text-center',
  'font-size: 13px; color: var(--text-tertiary);': 'fs-13 text-tertiary',
  'font-size: 13px; color: var(--text-secondary);': 'fs-13 text-secondary',
  'font-size: 13px; color: var(--text-secondary); margin-top: 2px;': 'fs-13 text-secondary mt-2',
  'font-size:13px;color:var(--text-secondary);margin-bottom:16px;': 'fs-13 text-secondary mb-md',
  'font-size:13px;color:var(--text-secondary);margin-top:2px;': 'fs-13 text-secondary mt-2',
  'font-size:13px;color:var(--text-secondary);': 'fs-13 text-secondary',
  'font-size:13px;color:var(--text-secondary);margin-top:4px;': 'fs-13 text-secondary mt-xs',
  'font-size:13px;color:var(--text-secondary);margin-bottom:8px;': 'fs-13 text-secondary mb-sm',
  'font-size:13px;color:var(--text-secondary);margin-bottom:24px;': 'fs-13 text-secondary mb-lg',
  'font-size:13px;color:var(--text-secondary);margin:12px 0 16px;': 'fs-13 text-secondary mt-12 mb-md',
  'font-size:13px;color:var(--text-secondary);line-height:1.45;margin-bottom:14px;': 'fs-13 text-secondary lh-145 mb-14',
  'font-size:14px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px;': 'fs-14 text-secondary lh-150 mb-14',
  'font-size:14px;color:var(--text-secondary);margin-bottom:16px;': 'fs-14 text-secondary mb-md',
  'font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;': 'fs-13 fw-600 text-secondary mb-sm',
  'font-size:13px;font-weight:600;color:var(--text-secondary);': 'fs-13 fw-600 text-secondary',
  'font-size:13px;color:var(--text-tertiary);text-align:center;padding:24px 0;': 'fs-13 text-tertiary text-center py-24',
  'font-size:13px;color:var(--text-tertiary);text-align:center;padding:16px 0;': 'fs-13 text-tertiary text-center py-16',
  'font-size:13px;color:var(--text-tertiary);text-align:center;padding:12px 0 4px;': 'fs-13 text-tertiary text-center pt-12 pb-4',
  'font-size:13px;color:var(--text-tertiary);': 'fs-13 text-tertiary',
  'font-size:13px;color:var(--text-tertiary);margin-top:4px;': 'fs-13 text-tertiary mt-xs',
  'font-size:12px;color:var(--text-tertiary);': 'fs-12 text-tertiary',
  'font-size:12px;color:var(--text-tertiary);margin-top:2px;': 'fs-12 text-tertiary mt-2',
  'font-size:12px;color:var(--text-tertiary);margin-top:10px;line-height:1.5;': 'fs-12 text-tertiary mt-10 lh-150',
  'font-size:12px;color:var(--text-secondary);': 'fs-12 text-secondary',
  'font-size:12px;color:var(--text-secondary);margin-top:2px;': 'fs-12 text-secondary mt-2',
  'font-size:12px;color:var(--text-secondary);margin-bottom:12px;': 'fs-12 text-secondary mb-12',
  'font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.5;': 'fs-13 text-secondary mb-md lh-150',

  // ---- margins ----
  'margin-bottom:0;': 'mb-0',
  'margin-bottom:16px;': 'mb-md',
  'margin-bottom: 16px;': 'mb-md',
  'margin-bottom:12px;': 'mb-12',
  'margin-bottom:10px;': 'mb-10',
  'margin-bottom:8px;': 'mb-sm',
  'margin-bottom:6px;': 'mb-6',
  'margin-bottom:4px;': 'mb-xs',
  'margin-top:8px;': 'mt-sm',
  'margin-top: 8px;': 'mt-sm',
  'margin-top:10px;': 'mt-10',
  'margin-top: 10px;': 'mt-10',
  'margin-top:12px;': 'mt-12',
  'margin-top: 12px;': 'mt-12',
  'margin-top:16px;': 'mt-md',
  'margin-top: 16px;': 'mt-md',
  'margin-top:4px;': 'mt-xs',
  'margin-top:6px;': 'mt-6',
  'margin-top:20px;': 'mt-20',
  'margin-top:24px;': 'mt-lg',
  'margin-top:28px;': 'mt-28',
  'margin-top: 32px;': 'mt-xl',
  'margin-top:32px;': 'mt-xl',
  'margin-top:14px;': 'mt-14',
  'margin-top:12px;margin-bottom:0;': 'mt-12 mb-0',
  'margin-top:12px;margin-bottom:4px;': 'mt-12 mb-xs',
  'margin-bottom:0;margin-top:14px;': 'mb-0 mt-14',
  'margin-left:auto;': 'ml-auto',
  'margin: 16px; margin-top: 0;': 'card-page',
  'margin: 16px; margin-top: 8px;': 'card-page-gap',
  'margin:16px;margin-top:8px;': 'card-page-gap',
  'margin:16px;margin-top:8px;background:var(--secondary-light);': 'card-page-gap bg-success-light',
  'margin:16px;margin-bottom:8px;': 'card-page-mb',
  'margin:16px;text-align:center;padding:24px;': 'card-empty-center',
  'margin-bottom:16px;background:linear-gradient(135deg,var(--primary) 0%,var(--primary-dark) 100%);color:white;': 'hero-card',
  'margin-bottom:8px;border-left:3px solid var(--primary);': 'mb-sm accent-left',
  'margin-top:12px;padding:10px 12px;background:var(--bg);border-radius:8px;font-size:12px;color:var(--text-secondary);': 'mt-12 dark-note fs-12 text-secondary',
  'margin-top:12px;padding-top:12px;border-top:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;': 'mt-12 top-divider flex justify-between items-center',
  'margin-top:12px;gap:8px;': 'mt-12 gap-sm',
  'margin-top:-4px;margin-bottom:14px;': 'mt-neg-4 mb-14',
  'margin-top:-4px;margin-bottom:16px;': 'mt-neg-4 mb-md',
  'margin-top:-8px;margin-bottom:8px;': 'mt-neg-8 mb-sm',
  'margin-top:-8px;margin-bottom:14px;': 'mt-neg-8 mb-14',
  'margin-top:-10px;margin-bottom:16px;': 'mt-neg-10 mb-md',
  'margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);': 'mt-md top-divider-strong',
  'margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-light); font-size: 13px; color: var(--text-secondary);': 'mt-10 top-divider-10 fs-13 text-secondary',
  'margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-light); display: flex; justify-content: space-between;': 'mt-10 top-divider-10 flex justify-between',
  'margin-top:32px;text-align:center;color:var(--text-tertiary);font-size:13px;': 'mt-xl text-center text-tertiary fs-13',
  'margin-top:6px;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:8px;': 'mt-6 fs-13 text-secondary flex items-center gap-sm',
  'margin-top:12px;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:8px;': 'mt-12 fs-13 text-secondary flex items-center gap-sm',
  'margin-top:12px;display:flex;align-items:center;gap:8px;': 'mt-12 flex items-center gap-sm',

  // ---- flex / layout ----
  'flex:1;': 'flex-1',
  'flex: 1;': 'flex-1',
  'flex:1;min-width:0;': 'flex-1 min-w-0',
  'flex: 1; min-width:0;': 'flex-1 min-w-0',
  'flex: 1; min-width: 0;': 'flex-1 min-w-0',
  'flex:1;text-align:center;font-size:18px;': 'page-heading',
  'flex: 1; text-align: center; font-size: 18px;': 'page-heading',
  'flex: 1; gap: 6px;': 'flex-1 gap-6',
  'flex-shrink:0;': 'shrink-0',
  'flex: 1; padding: 32px 24px 100px;': 'flex-1 pad-scroll',
  'display:flex;align-items:center;gap:12px;': 'flex items-center gap-12',
  'display: flex; align-items: center; gap: 12px;': 'flex items-center gap-12',
  'display:flex;align-items:center;gap:8px;': 'flex items-center gap-sm',
  'display:flex;align-items:center;justify-content:space-between;': 'flex items-center justify-between',
  'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;': 'flex items-center justify-between mb-sm',
  'display:flex;align-items:center;gap:16px;': 'flex items-center gap-md',
  'display:flex;flex-direction:column;gap:8px;': 'flex flex-col gap-sm',
  'display:flex;flex-direction:column;gap:8px;margin-bottom:18px;': 'flex flex-col gap-sm mb-18',
  'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;': 'flex items-start justify-between gap-12',
  'display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;': 'flex justify-between fs-13 mb-6',
  'display:flex;gap:8px;margin-top:16px;': 'flex gap-sm mt-md',
  'display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-tertiary);': 'flex items-center justify-center h-full text-tertiary',
  'display:flex;justify-content:space-between;': 'flex justify-between',
  'display:flex;flex-direction:column;': 'flex flex-col',
  'display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;': 'block fw-600 ellipsis',
  'display:block;font-size:12px;color:var(--text-tertiary);': 'block fs-12 text-tertiary',
  'display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;': 'grid-2 gap-sm',
  'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;': 'grid-2 gap-sm',
  'display:grid;grid-template-columns:repeat(2,1fr);gap:12px;': 'grid-2 gap-12',
  'display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px;': 'grid-2 gap-12 mb-20',
  'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px;margin-bottom:4px;': 'grid-2 gap-sm mt-12 mb-xs',
  'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;': 'grid-3 gap-6',
  'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;': 'grid-3 gap-sm mb-10',
  'display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;': 'grid-7 gap-xs',
  'display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px;': 'flex justify-between gap-12 items-start mb-12',
  'display:flex;justify-content:space-between;font-size:13px;font-weight:700;border-top:1px solid var(--border-light);padding-top:8px;margin-top:2px;': 'flex justify-between fs-13 fw-700 top-divider-8 mt-2',
  'display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid var(--border-light);': 'flex justify-between items-center top-divider-8',
  'display:flex;justify-content:space-between;align-items:center;': 'flex justify-between items-center',
  'display:flex;gap:8px;margin-top:14px;': 'flex gap-sm mt-14',
  'display:flex;gap:8px;margin-top:10px;': 'flex gap-sm mt-10',
  'display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;': 'flex gap-6 mt-10 wrap',
  'display:flex;gap:16px;': 'flex gap-md',
  'display:flex;gap:10px;align-items:flex-start;': 'flex gap-10 items-start',
  'display:flex;flex-wrap:wrap;gap:6px;': 'flex wrap gap-6',
  'display:flex;flex-direction:column;gap:8px;margin-top:8px;': 'flex flex-col gap-sm mt-sm',
  'display:flex;flex-direction:column;gap:8px;margin-top:16px;': 'flex flex-col gap-sm mt-md',
  'display:flex;flex-direction:column;gap:12px;': 'flex flex-col gap-12',
  'display:flex;align-items:flex-start;gap:12px;': 'flex items-start gap-12',
  'display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;': 'flex items-center gap-sm mt-sm wrap',
  'display:flex;align-items:center;gap:8px;margin-top:8px;': 'flex items-center gap-sm mt-sm',
  'display:flex; align-items:center; justify-content:space-between;': 'flex items-center justify-between',
  'display: flex; justify-content: space-between; align-items: center;': 'flex justify-between items-center',
  'display: flex; gap: 8px;': 'flex gap-sm',
  'display: flex; flex-direction: column; gap: 8px; margin-top: 16px;': 'flex flex-col gap-sm mt-md',
  'display: flex; flex-direction: column; gap: 16px;': 'flex flex-col gap-md',
  'display: flex; align-items: flex-start; gap: 12px;': 'flex items-start gap-12',

  // ---- sizing / padding / images ----
  'width:100%;text-align:left;margin-bottom:6px;': 'w-full text-left mb-6',
  'width:100%;text-align:left;': 'w-full text-left',
  'width: 40px;': 'w-40',
  'width:40px;': 'w-40',
  'width:32px;height:32px;border-radius:50%;': 'w-32 h-32 round',
  'width:100%;height:100%;object-fit:cover;display:block;': 'img-cover',
  'width:100%;max-height:55vh;object-fit:contain;border-radius:8px;background:var(--bg);': 'img-contain maxh-55',
  'width:100%;max-height:45vh;object-fit:contain;border-radius:8px;background:var(--bg);': 'img-contain maxh-45',
  'width:48px;height:48px;border-radius:50%;margin:0 auto 16px;': 'w-48 h-48 round mx-auto mb-md',
  'width:150px;height:20px;border-radius:6px;': 'w-150 h-20 br-6',
  'height: 100%;': 'h-full',
  'height:44px;border-radius:var(--radius-md);': 'h-44 br-md',
  'height:64px;border-radius:var(--radius-md);': 'h-64 br-md',
  'min-width:0;': 'min-w-0',
  'min-height: 100vh; display: flex; flex-direction: column;': 'minh-screen flex flex-col',
  'min-height:32px;padding:0 8px;': 'minh-32 px-sm',
  'aspect-ratio:auto;min-height:56px;flex-direction:column;gap:2px;padding:6px 2px;': 'aspect-auto minh-56 flex-col gap-2 pad-6-2',
  'padding:16px;': 'p-md',
  'padding: 16px;': 'p-md',
  'padding: 24px;': 'p-lg',
  'padding:0 16px;': 'px-md',
  'padding: 0 16px;': 'px-md',
  'padding:0 16px;margin-bottom:16px;': 'px-md mb-md',
  'padding:0 16px;margin-top:16px;': 'px-md mt-md',
  'padding: 0 16px; margin-top: 16px;': 'px-md mt-md',
  'padding: 0 16px; margin-bottom: 8px;': 'px-md mb-sm',
  'padding:0 16px 24px;': 'px-md pb-lg',
  'padding: 0 16px 24px;': 'px-md pb-lg',
  'padding:16px 16px 0;': 'p-md pb-0',
  'padding:48px 24px;': 'empty-state-lg',
  'text-align:center;padding:32px 24px;': 'center-box',
  'text-align:center;padding:32px 0;color:var(--text-tertiary);': 'center-box-tertiary',
  'text-align:center;margin-top:16px;': 'text-center mt-md',
  'text-transform:uppercase;': 'text-uppercase',
  'text-transform:capitalize;': 'text-capitalize',

  // ---- colours / misc ----
  'color:var(--text-tertiary);': 'text-tertiary',
  'color: var(--text-tertiary);': 'text-tertiary',
  'color:var(--text-secondary);': 'text-secondary',
  'color: var(--text-secondary);': 'text-secondary',
  'color: var(--secondary);': 'text-success',
  'color: var(--danger, #c0392b);': 'text-danger',
  'color:var(--primary);margin-right:12px;': 'text-brand mr-12',
  'color:var(--secondary);': 'text-success',
  'color:var(--warning,#b06000);': 'text-warning',
  'color:var(--warning);': 'text-warning',
  'color:var(--danger);': 'text-danger',
  'color:var(--danger,#e5484d);border-color:var(--danger,#e5484d66);': 'text-danger border-danger-soft',
  'color:var(--text-tertiary);font-size:13px;margin-top:4px;': 'text-tertiary fs-13 mt-xs',
  'color:var(--secondary);font-size:28px;': 'text-success fs-28',
  'color: var(--text-tertiary); margin-top: 2px;': 'text-tertiary mt-2',
  'color: var(--text-tertiary); flex-shrink: 0;': 'text-tertiary shrink-0',
  'color: var(--text-secondary);': 'text-secondary',
  'color: var(--text-secondary); margin-bottom: 28px; line-height: 1.5;': 'text-secondary mb-28 lh-150',
  'background:var(--danger-light);': 'bg-danger-light',
  'background: var(--secondary-light);': 'bg-success-light',
  'background: var(--bg);margin-bottom:12px;': 'bg-bg mb-12',
  'background: var(--bg);': 'bg-bg',
  'background:var(--surface-elevated);padding:8px 10px;margin-top:10px;': 'bg-surface-elevated pad-8-10 mt-10',
  'background:var(--bg);border-radius:12px;padding:12px 14px;margin-top:-8px;margin-bottom:14px;font-size:13px;color:var(--text-secondary);line-height:1.6;': 'dark-note-12 mt-neg-8 mb-14 fs-13 text-secondary lh-160',
  'border:1px solid var(--border-light);border-radius:8px;text-align:left;': 'bordered-8 text-left',
  'border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:10px;background:var(--warning-light);font-size:13px;line-height:1.4;': 'note-warning fs-13 lh-140',
  'border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:10px;background:var(--bg);': 'note-dark',
  'cursor:pointer;color:var(--text-secondary);font-size:13px;': 'cursor-pointer text-secondary fs-13',
  'cursor:pointer;': 'cursor-pointer',
  'cursor:default;': 'cursor-default',
  'opacity:0.75;': 'op-75',
  'white-space:pre-wrap;font-size:12px;color:var(--text-secondary);background:var(--bg-secondary,#00000011);padding:8px;border-radius:8px;margin-top:8px;max-height:200px;overflow-y:auto;': 'raw-text fs-12 text-secondary',
  'width: 56px; height: 56px; flex-shrink:0; border-radius: 50%; background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 600;': 'avatar-56 shrink-0',
  'width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 600;': 'avatar-56',
  'width: 30px; height: 30px; border-radius: 50%; background: var(--text-primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);': 'avatar-30',
  'width: 28px; height: 28px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);': 'avatar-28',

  // ---- second pass: leftover static patterns ----
  'font-weight:600;': 'fw-600',
  'font-weight:700;': 'fw-700',
  'font-weight: 600;': 'fw-600',
  'font-weight: 500;': 'fw-500',
  'font-weight:500;': 'fw-500',
  'font-weight:600;margin-bottom:4px;': 'fw-600 mb-xs',
  'font-weight: 600; margin-bottom: 4px;': 'fw-600 mb-xs',
  'font-weight:600;margin-bottom:12px;': 'fw-600 mb-12',
  'font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px;': 'fw-600 mb-12 flex items-center gap-sm',
  'font-weight:700;margin-bottom:10px;': 'fw-700 mb-10',
  'font-weight:700;margin-bottom:8px;': 'fw-700 mb-sm',
  'font-weight:700;margin-bottom:6px;': 'fw-700 mb-6',
  'font-weight:700;margin-bottom:4px;': 'fw-700 mb-xs',
  'font-weight:700;margin:16px 0 8px;': 'fw-700 mt-md mb-sm',
  'font-weight:700;color:var(--text-primary);': 'fw-700 text-primary',
  'font-weight:600;margin-top:8px;': 'fw-600 mt-sm',
  'font-weight:600;margin-bottom:8px;': 'fw-600 mb-sm',
  'font-weight:600;font-size:15px;': 'fw-600 fs-15',
  'font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;': 'fw-600 fs-15 ellipsis',
  'font-weight:600;color:var(--secondary);': 'fw-600 text-success',
  'font-weight:400;color:var(--text-tertiary);': 'fw-400 text-tertiary',
  'font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;': 'fw-500 fs-14 ellipsis',
  'max-width:100%;border-radius:8px;': 'max-w-full br-8',
  'color: var(--text-secondary); font-size: 13px; margin-bottom: 16px; line-height: 1.5;': 'text-secondary fs-13 mb-md lh-150',
  'display: flex; align-items: center; gap: 16px;': 'flex items-center gap-md',
  'display: flex; gap: 8px; margin-top: 16px;': 'flex gap-sm mt-md',
  'font-size: 12px; vertical-align: text-bottom;': 'fs-12 vtext-bottom',
  'font-size: 11px; color: var(--secondary); margin-top: 6px;': 'fs-11 text-success mt-6',
  'font-size: 11px; color: var(--secondary); margin-top: 4px;': 'fs-11 text-success mt-xs',
  'font-size: 10px; padding: 2px 8px; flex-shrink: 0;': 'fs-10 pill-pad shrink-0',
  'font-size: 10px; color: var(--text-tertiary); margin-top: 4px;': 'fs-10 text-tertiary mt-xs',
  'font-size:20px;font-weight:700;': 'fs-20 fw-700',
  'font-size:13px;color:var(--danger);text-align:center;padding:24px 0;': 'fs-13 text-danger text-center py-24',
  'position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:var(--bg);': 'photo-tile',
  'margin-top:14px;background:rgba(255,255,255,0.25);': 'mt-14 bg-soft-light'
};
const FILES = [
  'js/features/appointments/appointments.js',
  'js/features/money/money.js',
  'js/features/today/today.js',
  'js/features/followups/followups.js',
  'js/features/talk/talk.js',
  'js/features/customer/customer.js',
  'js/features/ocr/ocr.js',
  'js/features/control/control.js',
  'js/features/settings/settings.js',
  'js/features/measure/measure.js',
  'js/features/route/route.js',
  'js/features/onboarding/onboarding.js',
  'js/features/orders/orders.js',
  'js/features/today/home-screen-controller.js'
];

const ROOT = path.resolve(__dirname, '..');

function transform(src) {
  return src.replace(/<[a-zA-Z][^>\n]*>/g, tag => {
    if (!tag.includes('style="')) return tag;
    const styles = [...tag.matchAll(/style="([^"]*)"/g)];
    const hits = styles.filter(m => MAP[m[1]]);
    if (!hits.length) return tag;
    let out = tag;
    for (const m of hits) {
      out = out.replace(m[0], '');
      const cls = MAP[m[1]];
      const cm = out.match(/class="([^"]*)"/);
      if (cm) {
        out = out.replace(cm[0], `class="${(cm[1].trim() ? cm[1].trim() + ' ' : '')}${cls}"`);
      } else {
        out = out.replace(/^(<[a-zA-Z][a-zA-Z0-9]*)/, `$1 class="${cls}"`);
      }
    }
    return out;
  });
}

let total = 0;
for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  const removed = (before.match(/style="[^"]*"/g) || []).length - (after.match(/style="[^"]*"/g) || []).length;
  if (before !== after) {
    if (!DRY_RUN) fs.writeFileSync(file, after);
    console.log(`${DRY_RUN ? '[dry-run] ' : ''}${rel}: ${removed} inline style(s) would be removed`);
    total += removed;
  }
}
console.log(`total removed: ${total}`);
