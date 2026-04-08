use unicode_width::UnicodeWidthChar;
use bitflags::bitflags;

#[derive(Clone, Debug)]
pub struct Cell {
    pub ch:    char,
    pub fg:    Color,
    pub bg:    Color,
    pub flags: CellFlags,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Color {
    Default,
    Ansi(u8),
    Rgb(u8, u8, u8),
}

bitflags! {
    #[derive(Clone, Copy, Debug, Default, PartialEq)]
    pub struct CellFlags: u8 {
        const BOLD      = 0b0000_0001;
        const DIM       = 0b0000_0010;
        const ITALIC    = 0b0000_0100;
        const UNDERLINE = 0b0000_1000;
        const BLINK     = 0b0001_0000;
        const REVERSE   = 0b0010_0000;
        const INVISIBLE = 0b0100_0000;
    }
}

impl Default for Cell {
    fn default() -> Self {
        Self { ch: ' ', fg: Color::Default, bg: Color::Default, flags: CellFlags::empty() }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Selection {
    None,
    Rectangular { start_x: u16, start_y: u16, end_x: u16, end_y: u16 },
}

#[derive(Clone, Copy, PartialEq)]
pub enum FlowControl { Running, Stopped }

#[derive(Clone)]
pub struct SixelImage {
    pub x: u16, pub y: u16,
    pub width: u16, pub height: u16,
    pub data: Vec<u8>,
}

enum State { Ground, Escape, Csi(String), Osc(String), CharSet, Dcs(String) }

pub struct Terminal {
    pub cols: u16, pub rows: u16,
    pub screen:     Vec<Vec<Cell>>,
    pub scrollback: Vec<Vec<Cell>>,
    pub cx: u16, pub cy: u16,
    pub cursor_visible: bool,
    cur_fg: Color, cur_bg: Color, cur_flags: CellFlags,
    saved_cx: u16, saved_cy: u16,
    scroll_top: u16, scroll_bot: u16,
    pub scroll_off: i32,
    state: State,
    pub title: String,
    pub alt_screen:    Option<Vec<Vec<Cell>>>,
    pub in_alt_screen: bool,
    pub flow_control:  FlowControl,
    pub selection:     Selection,
    pub sixel_images:  Vec<SixelImage>,
    dcs_buf:           String,
    pub sixel_enabled: bool,
    pub sixel_max_w:   u32,
    pub sixel_max_h:   u32,
}

impl Terminal {
    pub fn new(cols: u16, rows: u16) -> Self {
        Self {
            cols, rows,
            screen: vec![vec![Cell::default(); cols as usize]; rows as usize],
            scrollback: Vec::new(),
            cx: 0, cy: 0, cursor_visible: true,
            cur_fg: Color::Default, cur_bg: Color::Default,
            cur_flags: CellFlags::empty(),
            saved_cx: 0, saved_cy: 0,
            scroll_top: 0, scroll_bot: rows - 1,
            scroll_off: 0,
            state: State::Ground,
            title: "Hacker Term".into(),   // ← poprawione z "NeonTerm"
            alt_screen: None,
            in_alt_screen: false,
            flow_control: FlowControl::Running,
            selection: Selection::None,
            sixel_images: Vec::new(),
            dcs_buf: String::new(),
            sixel_enabled: true,
            sixel_max_w: 1920,
            sixel_max_h: 1080,
        }
    }

    pub fn set_sixel_config(&mut self, enabled: bool, max_w: u32, max_h: u32) {
        self.sixel_enabled = enabled;
        self.sixel_max_w   = max_w;
        self.sixel_max_h   = max_h;
    }

    pub fn resize(&mut self, cols: u16, rows: u16) {
        if cols == self.cols && rows == self.rows { return; }
        self.cols = cols; self.rows = rows;
        for row in &mut self.screen { row.resize(cols as usize, Cell::default()); }
        self.screen.resize(rows as usize, vec![Cell::default(); cols as usize]);
        self.cx = self.cx.min(cols.saturating_sub(1));
        self.cy = self.cy.min(rows.saturating_sub(1));
        self.scroll_top = 0; self.scroll_bot = rows - 1;
        if let Some(alt) = &mut self.alt_screen {
            for row in &mut *alt { row.resize(cols as usize, Cell::default()); }
            alt.resize(rows as usize, vec![Cell::default(); cols as usize]);
        }
    }

    pub fn scroll_view(&mut self, delta: i32) {
        self.scroll_off = (self.scroll_off - delta).max(0).min(self.scrollback.len() as i32);
    }

    pub fn feed(&mut self, data: &[u8]) {
        if self.flow_control == FlowControl::Stopped { return; }
        self.scroll_off = 0;
        for ch in String::from_utf8_lossy(data).chars() { self.step(ch); }
    }

    fn step(&mut self, c: char) {
        match self.state {
            State::Ground  => self.ground(c),
            State::Escape  => self.esc(c),
            State::Csi(_)  => self.csi_ch(c),
            State::Osc(_)  => self.osc_ch(c),
            State::CharSet => { self.state = State::Ground; }
            State::Dcs(_)  => self.dcs_ch(c),
        }
    }

    fn ground(&mut self, c: char) {
        match c {
            '\x1b' => self.state = State::Escape,
            '\r'   => self.cx = 0,
            '\n' | '\x0b' | '\x0c' => self.lf(),
            '\x08' => { if self.cx > 0 { self.cx -= 1; } }
            '\t'   => { let n = (self.cx / 8 + 1) * 8; self.cx = n.min(self.cols - 1); }
            '\x07' => {}
            '\x00'..='\x06' | '\x0e'..='\x1a' | '\x1c'..='\x1f' | '\x7f' => {}
            _      => self.put(c),
        }
    }

    fn esc(&mut self, c: char) {
        self.state = State::Ground;
        match c {
            '[' => self.state = State::Csi(String::new()),
            ']' => self.state = State::Osc(String::new()),
            '(' | ')' | '*' | '+' => self.state = State::CharSet,
            'P' => { self.state = State::Dcs(String::new()); self.dcs_buf.clear(); }
            'D' => self.lf(),
            'E' => { self.cx = 0; self.lf(); }
            'M' => self.ri(),
            '7' => { self.saved_cx = self.cx; self.saved_cy = self.cy; }
            '8' => { self.cx = self.saved_cx; self.cy = self.saved_cy; }
            'c' => self.full_reset(),
            _   => {}
        }
    }

    fn csi_ch(&mut self, c: char) {
        if let State::Csi(ref mut buf) = self.state {
            match c {
                '\x00'..='\x1f' => {}
                '0'..='9' | ';' | ':' | '?' | '>' | '<' | '!' | '"' | '\'' => buf.push(c),
                _ => { let b = buf.clone(); self.state = State::Ground; self.csi(&b, c); }
            }
        }
    }

    fn osc_ch(&mut self, c: char) {
        if let State::Osc(ref mut buf) = self.state {
            if c == '\x07' || c == '\x1b' {
                let s = buf.clone(); self.state = State::Ground;
                if s.starts_with("0;") || s.starts_with("2;") { self.title = s[2..].into(); }
            } else { buf.push(c); }
        }
    }

    fn dcs_ch(&mut self, c: char) {
        if let State::Dcs(ref mut buf) = self.state {
            if c == '\x1b' {
                let data = std::mem::take(buf);
                self.state = State::Ground;
                self.handle_dcs(&data);
            } else { buf.push(c); }
        }
    }

    fn handle_dcs(&mut self, data: &str) {
        if data.starts_with('q') && self.sixel_enabled {
            if let Some(img) = crate::sixel::parse_sixel(
                data[1..].as_bytes(), self.cx, self.cy,
                                                         self.cols, self.sixel_max_w, self.sixel_max_h,
            ) {
                self.sixel_images.push(img);
            }
        }
    }

    fn csi(&mut self, raw: &str, cmd: char) {
        let s: &str = raw.trim_start_matches(|c: char| !c.is_ascii_digit() && c != ';');
        let ns: Vec<u32> = s.split(';').filter_map(|t| t.parse().ok()).collect();
        let p = |i: usize, d: u32| ns.get(i).copied().unwrap_or(d);
        let priv_ = raw.starts_with('?');
        match cmd {
            'A' => self.cy = self.cy.saturating_sub(p(0,1) as u16),
            'B' | 'e' => self.cy = (self.cy + p(0,1) as u16).min(self.rows-1),
            'C' | 'a' => self.cx = (self.cx + p(0,1) as u16).min(self.cols-1),
            'D' => self.cx = self.cx.saturating_sub(p(0,1) as u16),
            'E' => { self.cx=0; self.cy=(self.cy+p(0,1) as u16).min(self.rows-1); }
            'F' => { self.cx=0; self.cy=self.cy.saturating_sub(p(0,1) as u16); }
            'G' | '`' => self.cx=(p(0,1) as u16).saturating_sub(1).min(self.cols-1),
            'H' | 'f' => {
                self.cy=(p(0,1) as u16).saturating_sub(1).min(self.rows-1);
                self.cx=(p(1,1) as u16).saturating_sub(1).min(self.cols-1);
            }
            'J' => self.ed(p(0,0)),
            'K' => self.el(p(0,0)),
            'L' => self.il(p(0,1) as u16),
            'M' => self.dl(p(0,1) as u16),
            'P' => self.dch(p(0,1) as u16),
            'S' => self.su(p(0,1) as u16),
            'T' => self.sd(p(0,1) as u16),
            'X' => self.ech(p(0,1) as u16),
            '@' => self.ich(p(0,1) as u16),
            'd' => self.cy=(p(0,1) as u16).saturating_sub(1).min(self.rows-1),
            'm' => self.sgr(&ns),
            'h' => if priv_ { self.dec(&ns, true); }
            'l' => if priv_ { self.dec(&ns, false); }
            'r' => {
                self.scroll_top=(p(0,1) as u16).saturating_sub(1);
                self.scroll_bot=(p(1,self.rows as u32) as u16).saturating_sub(1).min(self.rows-1);
            }
            's' => { self.saved_cx=self.cx; self.saved_cy=self.cy; }
            'u' => { self.cx=self.saved_cx; self.cy=self.saved_cy; }
            _ => {}
        }
    }

    fn dec(&mut self, ns: &[u32], v: bool) {
        for &n in ns {
            match n {
                25 => self.cursor_visible = v,
                47 | 1047 | 1049 => {
                    if v { self.switch_to_alt_screen(); } else { self.switch_to_main_screen(); }
                }
                _ => {}
            }
        }
    }

    pub fn switch_to_alt_screen(&mut self) {
        if !self.in_alt_screen {
            self.alt_screen = Some(self.screen.clone());
            self.screen = vec![vec![Cell::default(); self.cols as usize]; self.rows as usize];
            self.in_alt_screen = true;
            self.cx = 0; self.cy = 0;
        }
    }

    pub fn switch_to_main_screen(&mut self) {
        if self.in_alt_screen {
            if let Some(main) = self.alt_screen.take() { self.screen = main; }
            self.in_alt_screen = false;
            self.cx = 0; self.cy = 0;
        }
    }

    fn sgr(&mut self, ps: &[u32]) {
        let ps = if ps.is_empty() { &[0u32][..] } else { ps };
        let mut i = 0;
        while i < ps.len() {
            match ps[i] {
                0  => { self.cur_fg=Color::Default; self.cur_bg=Color::Default; self.cur_flags=CellFlags::empty(); }
                1  => self.cur_flags.insert(CellFlags::BOLD),
                2  => self.cur_flags.insert(CellFlags::DIM),
                3  => self.cur_flags.insert(CellFlags::ITALIC),
                4  => self.cur_flags.insert(CellFlags::UNDERLINE),
                5 | 6 => self.cur_flags.insert(CellFlags::BLINK),
                7  => self.cur_flags.insert(CellFlags::REVERSE),
                8  => self.cur_flags.insert(CellFlags::INVISIBLE),
                22 => self.cur_flags.remove(CellFlags::BOLD | CellFlags::DIM),
                23 => self.cur_flags.remove(CellFlags::ITALIC),
                24 => self.cur_flags.remove(CellFlags::UNDERLINE),
                25 => self.cur_flags.remove(CellFlags::BLINK),
                27 => self.cur_flags.remove(CellFlags::REVERSE),
                30..=37 => self.cur_fg = Color::Ansi((ps[i]-30) as u8),
                38 if ps.get(i+1)==Some(&2) && i+4<ps.len() => {
                    self.cur_fg=Color::Rgb(ps[i+2] as u8,ps[i+3] as u8,ps[i+4] as u8); i+=4;
                }
                38 if ps.get(i+1)==Some(&5) && i+2<ps.len() => {
                    self.cur_fg=Color::Ansi(ps[i+2] as u8); i+=2;
                }
                39 => self.cur_fg = Color::Default,
                40..=47 => self.cur_bg = Color::Ansi((ps[i]-40) as u8),
                48 if ps.get(i+1)==Some(&2) && i+4<ps.len() => {
                    self.cur_bg=Color::Rgb(ps[i+2] as u8,ps[i+3] as u8,ps[i+4] as u8); i+=4;
                }
                48 if ps.get(i+1)==Some(&5) && i+2<ps.len() => {
                    self.cur_bg=Color::Ansi(ps[i+2] as u8); i+=2;
                }
                49 => self.cur_bg = Color::Default,
                90..=97  => self.cur_fg = Color::Ansi((ps[i]-90+8) as u8),
                100..=107 => self.cur_bg = Color::Ansi((ps[i]-100+8) as u8),
                _ => {}
            }
            i += 1;
        }
    }

    fn put(&mut self, c: char) {
        let w = c.width().unwrap_or(1) as u16;
        if self.cx >= self.cols { self.cx = 0; self.lf(); }
        let x = self.cx as usize; let y = self.cy as usize;
        if y < self.screen.len() && x < self.cols as usize {
            self.screen[y][x] = Cell { ch: c, fg: self.cur_fg.clone(), bg: self.cur_bg.clone(), flags: self.cur_flags };
            if w > 1 && x+1 < self.cols as usize { self.screen[y][x+1] = Cell::default(); }
        }
        self.cx += w;
    }

    fn lf(&mut self) {
        if self.cy == self.scroll_bot {
            let row = self.screen[self.scroll_top as usize].clone();
            self.scrollback.push(row);
            if self.scrollback.len() > 10_000 { self.scrollback.remove(0); }
            let t = self.scroll_top as usize; let b = self.scroll_bot as usize;
            self.screen[t..=b].rotate_left(1);
            self.screen[b] = vec![Cell::default(); self.cols as usize];
        } else if self.cy < self.rows - 1 { self.cy += 1; }
    }

    fn ri(&mut self) {
        if self.cy == self.scroll_top {
            let t = self.scroll_top as usize; let b = self.scroll_bot as usize;
            self.screen[t..=b].rotate_right(1);
            self.screen[t] = vec![Cell::default(); self.cols as usize];
        } else if self.cy > 0 { self.cy -= 1; }
    }

    fn ed(&mut self, m: u32) {
        let (x,y,c) = (self.cx as usize, self.cy as usize, self.cols as usize);
        match m {
            0 => { for i in x..c { self.screen[y][i]=Cell::default(); } for r in y+1..self.rows as usize { self.screen[r]=vec![Cell::default();c]; } }
            1 => { for i in 0..=x { if i<c { self.screen[y][i]=Cell::default(); } } for r in 0..y { self.screen[r]=vec![Cell::default();c]; } }
            2 | 3 => self.clear(),
            _ => {}
        }
    }

    fn el(&mut self, m: u32) {
        let (x,y,c) = (self.cx as usize, self.cy as usize, self.cols as usize);
        match m {
            0 => for i in x..c { self.screen[y][i]=Cell::default(); },
            1 => for i in 0..=x.min(c-1) { self.screen[y][i]=Cell::default(); },
            2 => self.screen[y] = vec![Cell::default();c],
            _ => {}
        }
    }

    fn ech(&mut self, n: u16) {
        let (x,y) = (self.cx as usize, self.cy as usize);
        for i in x..(x+n as usize).min(self.cols as usize) { self.screen[y][i]=Cell::default(); }
    }
    fn ich(&mut self, n: u16) {
        let (x,y,c)=(self.cx as usize,self.cy as usize,self.cols as usize);
        for _ in 0..n { if x<c { self.screen[y].insert(x,Cell::default()); self.screen[y].truncate(c); } }
    }
    fn dch(&mut self, n: u16) {
        let (x,y,c)=(self.cx as usize,self.cy as usize,self.cols as usize);
        for _ in 0..n { if x<self.screen[y].len() { self.screen[y].remove(x); self.screen[y].push(Cell::default()); } }
        self.screen[y].truncate(c);
    }
    fn il(&mut self, n: u16) {
        let (y,b,c)=(self.cy as usize,self.scroll_bot as usize,self.cols as usize);
        for _ in 0..n { if y<=b { self.screen.remove(b); self.screen.insert(y,vec![Cell::default();c]); } }
    }
    fn dl(&mut self, n: u16) {
        let (y,b,c)=(self.cy as usize,self.scroll_bot as usize,self.cols as usize);
        for _ in 0..n { if y<=b { self.screen.remove(y); self.screen.insert(b,vec![Cell::default();c]); } }
    }
    fn su(&mut self, n: u16) {
        let (t,b,c)=(self.scroll_top as usize,self.scroll_bot as usize,self.cols as usize);
        for _ in 0..n { let r=self.screen[t].clone(); self.scrollback.push(r); self.screen[t..=b].rotate_left(1); self.screen[b]=vec![Cell::default();c]; }
    }
    fn sd(&mut self, n: u16) {
        let (t,b,c)=(self.scroll_top as usize,self.scroll_bot as usize,self.cols as usize);
        for _ in 0..n { self.screen[t..=b].rotate_right(1); self.screen[t]=vec![Cell::default();c]; }
    }
    fn clear(&mut self) {
        for row in &mut self.screen { *row = vec![Cell::default(); self.cols as usize]; }
    }
    fn full_reset(&mut self) {
        self.cur_fg=Color::Default; self.cur_bg=Color::Default; self.cur_flags=CellFlags::empty();
        self.cx=0; self.cy=0; self.scroll_top=0; self.scroll_bot=self.rows-1; self.clear();
    }

    pub fn visible_lines(&self) -> Vec<&Vec<Cell>> {
        if self.scroll_off == 0 { return self.screen.iter().collect(); }
        let off   = self.scroll_off as usize;
        let start = self.scrollback.len().saturating_sub(off);
        let mut lines: Vec<&Vec<Cell>> = self.scrollback[start..].iter().collect();
        let need = self.rows as usize;
        if lines.len() < need {
            lines.extend(self.screen[..(need-lines.len()).min(self.screen.len())].iter());
        } else { lines.truncate(need); }
        lines
    }

    pub fn start_selection(&mut self, x: u16, y: u16) {
        self.selection = Selection::Rectangular { start_x: x, start_y: y, end_x: x, end_y: y };
    }

    pub fn update_selection(&mut self, x: u16, y: u16) {
        if let Selection::Rectangular { start_x, start_y, .. } = &self.selection {
            self.selection = Selection::Rectangular {
                start_x: *start_x, start_y: *start_y, end_x: x, end_y: y,
            };
        }
    }

    pub fn clear_selection(&mut self) { self.selection = Selection::None; }

    pub fn get_selected_text(&self) -> String {
        match &self.selection {
            Selection::Rectangular { start_x, start_y, end_x, end_y } => {
                let x1 = *start_x.min(end_x); let x2 = *start_x.max(end_x);
                let y1 = *start_y.min(end_y); let y2 = *start_y.max(end_y);
                let mut text = String::new();
                for y in y1..=y2 {
                    let row = if (y as usize) < self.screen.len() { &self.screen[y as usize] } else { continue };
                    for x in x1..=x2 {
                        if (x as usize) < row.len() { text.push(row[x as usize].ch); }
                    }
                    if y != y2 { text.push('\n'); }
                }
                text
            }
            Selection::None => String::new(),
        }
    }

    pub fn flow_control_stop(&mut self)  { self.flow_control = FlowControl::Stopped; }
    pub fn flow_control_start(&mut self) { self.flow_control = FlowControl::Running; }
}
