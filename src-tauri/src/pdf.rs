//! Collection -> PDF export, generated natively with printpdf 0.8.
//!
//! The WebView's window.print() is unreliable across platforms (unsupported
//! in macOS WKWebView), so the PDF is built here. The bundled NanumGothic
//! font is embedded so Korean (and other non-Latin) text renders correctly;
//! printpdf subsets the font to just the glyphs used, keeping output small.

use printpdf::*;
use serde::Deserialize;

/// NanumGothic (SIL OFL 1.1). License: src-tauri/resources/fonts/OFL.txt
const NANUM_REGULAR: &[u8] = include_bytes!("../resources/fonts/NanumGothic-Regular.ttf");
const NANUM_BOLD: &[u8] = include_bytes!("../resources/fonts/NanumGothic-Bold.ttf");

#[derive(Deserialize)]
pub struct ExportEntry {
    /// Item-kind tag — "POS" / "MOD" / "DRG". Shown as a leading chip in
    /// the PDF header line and as the first column in CSV exports.
    pub kind: String,
    /// Display code — POS code, modifier letters, or DRG number.
    pub code: String,
    /// One-line label (POS name, modifier name, DRG name).
    pub name: String,
    /// Longer description, when available. Empty for DRGs (name IS the
    /// description for them).
    pub description: String,
    /// User's note for this item, or empty.
    pub note: String,
    /// Kind-specific compact summary — e.g.
    ///   POS: "Effective 2003-04-01"
    ///   MOD: "Usage: bilateral procedures | Billing impact: +50% per side"
    ///   DRG: "MDC 05 · Medical · With CC · Wt 0.8490 · GMLOS 4.20d"
    /// The frontend assembles this string; the renderer just lays it out.
    pub details: String,
}

// US Letter, in millimetres.
const PAGE_W: f32 = 215.9;
const PAGE_H: f32 = 279.4;
const MARGIN: f32 = 18.0;
const BOTTOM_LIMIT: f32 = 16.0;
const MM_PER_PT: f32 = 0.352_777_8;

fn mm_to_pt(mm: f32) -> f32 {
    mm / MM_PER_PT
}

/// Approximate display width of a character in half-em units. CJK / Hangul
/// glyphs are roughly full-width (2 units); Latin glyphs about half-em (1).
fn char_units(c: char) -> usize {
    let u = c as u32;
    let wide = (0x1100..=0x11FF).contains(&u)
        || (0x2E80..=0xA4CF).contains(&u)
        || (0xAC00..=0xD7A3).contains(&u)
        || (0xF900..=0xFAFF).contains(&u)
        || (0xFF00..=0xFF60).contains(&u);
    if wide {
        2
    } else {
        1
    }
}

fn units(s: &str) -> usize {
    s.chars().map(char_units).sum()
}

/// Greedy word wrap. Width is estimated in half-em units so Latin and CJK
/// text both wrap close to the page edge.
fn wrap(s: &str, font_size: f32, avail_mm: f32) -> Vec<String> {
    let unit_mm = 0.5 * font_size * MM_PER_PT;
    let max_units = ((avail_mm / unit_mm).floor() as usize).max(8);
    let mut lines: Vec<String> = Vec::new();

    for raw in s.split('\n') {
        let mut cur = String::new();
        let mut cur_units = 0;
        for word in raw.split_whitespace() {
            let w_units = units(word);
            if cur.is_empty() {
                cur = word.to_string();
                cur_units = w_units;
            } else if cur_units + 1 + w_units <= max_units {
                cur.push(' ');
                cur.push_str(word);
                cur_units += 1 + w_units;
            } else {
                lines.push(std::mem::take(&mut cur));
                cur = word.to_string();
                cur_units = w_units;
            }
            while cur_units > max_units {
                let mut head = String::new();
                let mut head_units = 0;
                let mut rest = cur.chars().peekable();
                while let Some(&c) = rest.peek() {
                    let cu = char_units(c);
                    if head_units + cu > max_units {
                        break;
                    }
                    head.push(c);
                    head_units += cu;
                    rest.next();
                }
                lines.push(head);
                cur = rest.collect();
                cur_units = units(&cur);
            }
        }
        lines.push(cur);
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

/// Accumulates text into pages, flowing onto a new page at the bottom margin.
struct Layout {
    regular: FontId,
    bold: FontId,
    pages: Vec<Vec<Op>>,
    cur: Vec<Op>,
    y: f32,
}

impl Layout {
    fn new(regular: FontId, bold: FontId) -> Self {
        Self {
            regular,
            bold,
            pages: Vec::new(),
            cur: vec![Op::StartTextSection],
            y: PAGE_H - MARGIN,
        }
    }

    fn new_page(&mut self) {
        self.cur.push(Op::EndTextSection);
        let finished = std::mem::replace(&mut self.cur, vec![Op::StartTextSection]);
        self.pages.push(finished);
        self.y = PAGE_H - MARGIN;
    }

    fn gap(&mut self, mm: f32) {
        self.y -= mm;
        if self.y < BOTTOM_LIMIT {
            self.new_page();
        }
    }

    /// Polish — centered text. Used for the report title so each page's
    /// header looks like a document, not a left-aligned bullet list.
    fn text_centered(&mut self, s: &str, size: f32, bold: bool) {
        let font = if bold {
            self.bold.clone()
        } else {
            self.regular.clone()
        };
        let line_h = size * 1.34 * MM_PER_PT;
        let avail = PAGE_W - 2.0 * MARGIN;
        for line in wrap(s, size, avail) {
            if self.y < BOTTOM_LIMIT {
                self.new_page();
            }
            // Width estimate in mm: 0.5 em per unit × pt size × mm/pt.
            let text_w_mm = 0.5 * size * (MM_PER_PT) * (units(&line) as f32);
            let x = mm_to_pt((PAGE_W - text_w_mm).max(MARGIN) / 2.0);
            let y = mm_to_pt(self.y);
            self.cur.push(Op::SetTextMatrix {
                matrix: TextMatrix::Translate(Pt(x), Pt(y)),
            });
            self.cur.push(Op::SetFontSize {
                size: Pt(size),
                font: font.clone(),
            });
            self.cur.push(Op::WriteText {
                items: vec![TextItem::Text(line)],
                font: font.clone(),
            });
            self.y -= line_h;
        }
    }

    /// Polish — light-gray horizontal rule between row groups.
    /// y position is `self.y + 4.5mm` per the IMPROVEMENT_PLAN warning:
    /// `self.y` is the NEXT row's baseline, so the rule needs to sit
    /// above it. Smaller values (eg +0.5) draw THROUGH glyphs.
    fn hr(&mut self) {
        let y_pt = mm_to_pt(self.y + 4.5);
        let x_left = mm_to_pt(MARGIN);
        let x_right = mm_to_pt(PAGE_W - MARGIN);
        // End the current text section so vector ops draw outside it.
        self.cur.push(Op::EndTextSection);
        self.cur.push(Op::SetOutlineColor {
            col: Color::Rgb(Rgb {
                r: 0.82,
                g: 0.82,
                b: 0.84,
                icc_profile: None,
            }),
        });
        self.cur.push(Op::SetOutlineThickness { pt: Pt(0.5) });
        self.cur.push(Op::DrawLine {
            line: Line {
                points: vec![
                    LinePoint {
                        p: Point {
                            x: Pt(x_left),
                            y: Pt(y_pt),
                        },
                        bezier: false,
                    },
                    LinePoint {
                        p: Point {
                            x: Pt(x_right),
                            y: Pt(y_pt),
                        },
                        bezier: false,
                    },
                ],
                is_closed: false,
            },
        });
        // Re-enter text mode so subsequent .text() calls work.
        self.cur.push(Op::StartTextSection);
    }

    fn text(&mut self, s: &str, size: f32, indent: f32, bold: bool) {
        let font = if bold {
            self.bold.clone()
        } else {
            self.regular.clone()
        };
        let line_h = size * 1.34 * MM_PER_PT;
        let avail = PAGE_W - 2.0 * MARGIN - indent;
        for line in wrap(s, size, avail) {
            if self.y < BOTTOM_LIMIT {
                self.new_page();
            }
            let x = mm_to_pt(MARGIN + indent);
            let y = mm_to_pt(self.y);
            self.cur.push(Op::SetTextMatrix {
                matrix: TextMatrix::Translate(Pt(x), Pt(y)),
            });
            self.cur.push(Op::SetFontSize {
                size: Pt(size),
                font: font.clone(),
            });
            self.cur.push(Op::WriteText {
                items: vec![TextItem::Text(line)],
                font: font.clone(),
            });
            self.y -= line_h;
        }
    }

    fn finish(mut self) -> Vec<PdfPage> {
        if self.cur.len() > 1 {
            self.cur.push(Op::EndTextSection);
            self.pages.push(self.cur);
        }
        if self.pages.is_empty() {
            self.pages
                .push(vec![Op::StartTextSection, Op::EndTextSection]);
        }
        self.pages
            .into_iter()
            .map(|ops| PdfPage::new(Mm(PAGE_W), Mm(PAGE_H), ops))
            .collect()
    }
}

pub fn export(path: &str, title: &str, entries: &[ExportEntry]) -> Result<(), String> {
    let mut doc = PdfDocument::new(title);
    let regular = ParsedFont::from_bytes(NANUM_REGULAR, 0, &mut Vec::new())
        .ok_or_else(|| "failed to parse embedded font".to_string())?;
    let bold = ParsedFont::from_bytes(NANUM_BOLD, 0, &mut Vec::new())
        .ok_or_else(|| "failed to parse embedded bold font".to_string())?;
    let regular_id = doc.add_font(&regular);
    let bold_id = doc.add_font(&bold);

    let mut layout = Layout::new(regular_id, bold_id);

    // Polish — centered title + dataset attribution line.
    layout.text_centered(title, 18.0, true);
    layout.gap(1.5);
    layout.text_centered(
        &format!("{} items  ·  MedBill Snap (CMS FY 2026)", entries.len()),
        9.0,
        false,
    );
    layout.gap(6.0);

    for (i, e) in entries.iter().enumerate() {
        // Polish — gray separator between rows (not before the first).
        if i > 0 {
            layout.hr();
        }
        let header = if e.kind.is_empty() {
            e.code.clone()
        } else {
            format!("{}  {}", e.kind, e.code)
        };
        layout.text(&header, 13.0, 0.0, true);
        if !e.name.is_empty() {
            layout.text(&e.name, 10.5, 0.0, false);
        }
        if !e.description.is_empty() && e.description != e.name {
            layout.text(&e.description, 9.5, 5.0, false);
        }
        if !e.details.trim().is_empty() {
            layout.text(&e.details, 8.5, 5.0, false);
        }
        if !e.note.trim().is_empty() {
            layout.text(&format!("Note: {}", e.note), 9.5, 5.0, false);
        }
        layout.gap(4.5);
    }

    let pages = layout.finish();
    let bytes = doc
        .with_pages(pages)
        .save(&PdfSaveOptions::default(), &mut Vec::new());
    std::fs::write(path, bytes).map_err(|e| format!("cannot write PDF: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(kind: &str, code: &str, note: &str) -> ExportEntry {
        ExportEntry {
            kind: kind.into(),
            code: code.into(),
            name: "Heart Failure and Shock with CC".into(),
            description: "Routes to DRG 292 when a CC-level secondary diagnosis \
                accompanies a heart-failure principal — an intentionally long \
                description so word wrapping and page flow are exercised."
                .into(),
            note: note.into(),
            details: "MDC 05 · Medical · With CC · Wt 0.8490 · GMLOS 4.20d".into(),
        }
    }

    #[test]
    fn produces_a_valid_ascii_pdf() {
        let path = std::env::temp_dir().join("medbillsnap_pdf_ascii.pdf");
        let path = path.to_str().unwrap();
        let kinds = ["POS", "MOD", "DRG"];
        let entries: Vec<ExportEntry> = (0..40)
            .map(|i| {
                entry(
                    kinds[i % kinds.len()],
                    &format!("{:03}", i + 200),
                    if i % 3 == 0 { "Check coverage" } else { "" },
                )
            })
            .collect();
        export(path, "Test Collection", &entries).expect("export should succeed");

        let bytes = std::fs::read(path).expect("output file should exist");
        assert_eq!(&bytes[..5], b"%PDF-", "missing PDF header");
        assert!(bytes.windows(5).any(|w| w == b"%%EOF"), "missing EOF marker");
    }

    #[test]
    fn produces_a_small_korean_pdf() {
        let path = std::env::temp_dir().join("medbillsnap_pdf_korean.pdf");
        let path = path.to_str().unwrap();
        let entries = vec![entry("DRG", "292", "환자 케이스 — 보험 확인 필요")];
        export(path, "심부전 라우팅 모음", &entries).expect("korean export should succeed");

        let bytes = std::fs::read(path).expect("output file should exist");
        assert_eq!(&bytes[..5], b"%PDF-", "missing PDF header");
        assert!(
            bytes.len() < 400_000,
            "korean pdf is {} bytes — font subsetting may have failed",
            bytes.len(),
        );
    }

    #[test]
    fn wrap_handles_long_words_and_cjk() {
        assert_eq!(wrap("", 10.0, 100.0), vec![String::new()]);
        assert!(wrap(&"x".repeat(500), 10.0, 80.0).len() > 1, "long word must wrap");
        assert!(wrap(&"가".repeat(200), 10.0, 80.0).len() > 1, "long Korean run must wrap");
    }
}
