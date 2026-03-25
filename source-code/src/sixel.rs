use crate::terminal::SixelImage;
use image::{Rgba, RgbaImage};

/// Parsuje dane Sixel (sekwencja DCS q ... ST) i zwraca obraz w formacie RGBA.
/// Wspiera tylko podstawowe kodowanie – w pełnej wersji należałoby zaimplementować
/// pełny parser zgodny ze specyfikacją DEC Sixel.
pub fn parse_sixel(
    data: &[u8],
    x: u16,
    y: u16,
    _max_cells: u16,        // prefiks _ oznacza, że zmienna jest nieużywana (unikanie ostrzeżenia)
max_width: u32,
max_height: u32,
) -> Option<SixelImage> {
    // Konwersja danych Sixel na surowe RGBA.
    // Jeśli dane zaczynają się od magicznych bajtów PNG, wczytujemy jako PNG.
    if data.len() > 8 && &data[0..8] == b"\x89PNG\r\n\x1a\n" {
        if let Ok(img) = image::load_from_memory(data) {
            let rgba = img.into_rgba8();
            let (w, h) = (rgba.width(), rgba.height());
            if w <= max_width && h <= max_height {
                return Some(SixelImage {
                    x,
                    y,
                    width: w as u16,
                    height: h as u16,
                    data: rgba.into_raw(),
                });
            }
        }
    }

    // Fallback – próba parsowania prostego Sixel (tylko kolory 0-15, brak RLE)
    // To tylko szkic – prawdziwy parser jest znacznie bardziej złożony.
    use std::collections::VecDeque;

    let mut lines = VecDeque::new();
    let mut current_line = Vec::new();
    for &byte in data {
        if byte == b'$' {
            // koniec linii
            if !current_line.is_empty() {
                lines.push_back(std::mem::take(&mut current_line));
            }
        } else if byte == b'-' {
            // nowa linia z kontynuacją
            if !current_line.is_empty() {
                lines.push_back(std::mem::take(&mut current_line));
            }
        } else if byte >= b'?' && byte <= b'~' {
            // kod Sixel
            let code = (byte - b'?') as u8;
            current_line.push(code);
        }
    }
    if !current_line.is_empty() {
        lines.push_back(current_line);
    }

    if lines.is_empty() {
        return None;
    }

    let width = lines.iter().map(|l| l.len()).max().unwrap_or(0) * 6; // każdy kod to 6 pikseli
    let height = lines.len() * 6; // każda linia to 6 pikseli wysokości
    if width == 0 || height == 0 || width > max_width as usize || height > max_height as usize {
        return None;
    }

    // Prosta paleta ANSI 16 kolorów (w przyszłości odczytywana z sekwencji)
    let palette: Vec<Rgba<u8>> = (0..16)
    .map(|i| {
        let c = match i {
            0 => (0x0F, 0x0F, 0x1A),
         1 => (0xFF, 0x3D, 0x5C),
         2 => (0x00, 0xFF, 0x88),
         3 => (0xFF, 0xD7, 0x00),
         4 => (0x33, 0x99, 0xFF),
         5 => (0xD9, 0x4F, 0xFF),
         6 => (0x00, 0xE5, 0xFF),
         7 => (0xCC, 0xD6, 0xFF),
         8 => (0x3D, 0x3D, 0x5C),
         9 => (0xFF, 0x66, 0x80),
         10 => (0x33, 0xFF, 0xAA),
         11 => (0xFF, 0xE0, 0x33),
         12 => (0x66, 0xBB, 0xFF),
         13 => (0xE5, 0x80, 0xFF),
         14 => (0x33, 0xEE, 0xFF),
         _ => (0xFF, 0xFF, 0xFF),
        };
        Rgba([c.0, c.1, c.2, 255])
    })
    .collect();

    let mut img = RgbaImage::new(width as u32, height as u32);
    for (row, line) in lines.iter().enumerate() {
        for (col, &code) in line.iter().enumerate() {
            let color = palette[(code % 16) as usize];
            for bit in 0..6 {
                if (code >> bit) & 1 == 1 {
                    let px_x = (col * 6 + bit) as u32;
                    let px_y = (row * 6) as u32;
                    if px_x < width as u32 && px_y < height as u32 {
                        img.put_pixel(px_x, px_y, color);
                    }
                }
            }
        }
    }

    Some(SixelImage {
        x,
         y,
         width: width as u16,
         height: height as u16,
         data: img.into_raw(),
    })
}
