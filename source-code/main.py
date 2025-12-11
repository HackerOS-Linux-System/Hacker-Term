import gi
gi.require_version('Gtk', '3.0')
gi.require_version('Vte', '2.91')
from gi.repository import Gtk, Vte, Gdk, GLib, Pango
import os
import sys
import platform

class TerminalTab(Gtk.Box):
    def __init__(self, window):
        super().__init__(orientation=Gtk.Orientation.VERTICAL)
        self.window = window

        # Create VTE Terminal
        self.terminal = Vte.Terminal()
        self.terminal.set_allow_hyperlink(True)
        self.terminal.set_scrollback_lines(10000)
        self.terminal.set_mouse_autohide(True)
        self.terminal.set_cursor_blink_mode(Vte.CursorBlinkMode.ON)
        self.terminal.set_cursor_shape(Vte.CursorShape.BLOCK)
        self.terminal.set_font(Pango.FontDescription("Fira Code 14"))

        # Custom colors - vibrant pastels for a nicer, more colorful look inspired by Termius
        palette = [
            Gdk.RGBA(0.10, 0.10, 0.12, 1),  # deep navy black
            Gdk.RGBA(0.98, 0.40, 0.45, 1),  # vibrant red
            Gdk.RGBA(0.40, 0.85, 0.45, 1),  # lively green
            Gdk.RGBA(0.98, 0.75, 0.30, 1),  # sunny yellow
            Gdk.RGBA(0.35, 0.60, 0.95, 1),  # electric blue
            Gdk.RGBA(0.75, 0.45, 0.90, 1),  # purple magenta
            Gdk.RGBA(0.30, 0.80, 0.85, 1),  # teal cyan
            Gdk.RGBA(0.95, 0.95, 0.97, 1),  # soft white
            Gdk.RGBA(0.25, 0.25, 0.30, 1),  # bright navy
            Gdk.RGBA(1.00, 0.55, 0.60, 1),  # bright red
            Gdk.RGBA(0.55, 0.95, 0.60, 1),  # bright green
            Gdk.RGBA(1.00, 0.85, 0.45, 1),  # bright yellow
            Gdk.RGBA(0.50, 0.75, 1.00, 1),  # bright blue
            Gdk.RGBA(0.85, 0.60, 1.00, 1),  # bright magenta
            Gdk.RGBA(0.45, 0.90, 0.95, 1),  # bright cyan
            Gdk.RGBA(1.00, 1.00, 1.00, 1)   # bright white
        ]
        self.terminal.set_colors(Gdk.RGBA(0.95, 0.95, 0.97, 1), Gdk.RGBA(0.05, 0.05, 0.10, 0.9), palette)  # Semi-transparent background

        # Spawn shell
        shell = os.environ.get('SHELL', '/bin/bash')
        if platform.system() == 'Linux' and os.path.exists('/bin/zsh'):
            shell = '/bin/zsh'
        working_directory = os.environ.get('HOME')
        argv = [shell]
        envv = [f"{k}={v}" for k, v in os.environ.items()]
        pid, _ = self.terminal.spawn_sync(
            Vte.PtyFlags.DEFAULT,
            working_directory,
            argv,
            envv,
            GLib.SpawnFlags.DO_NOT_REAP_CHILD,
            None,
            None
        )
        if pid == -1:
            print("Failed to spawn shell")
            sys.exit(1)

        # Scrolled window
        self.scrolled_window = Gtk.ScrolledWindow()
        self.scrolled_window.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
        self.scrolled_window.add(self.terminal)

        self.pack_start(self.scrolled_window, True, True, 0)

        # Connect signals
        self.terminal.connect("child-exited", self.on_child_exited)
        self.terminal.connect("button-press-event", self.window.on_button_press)

    def on_child_exited(self, terminal, status):
        # Close the tab when shell exits
        notebook = self.get_parent()
        page_num = notebook.page_num(self)
        if page_num != -1:
            notebook.remove_page(page_num)

class HackerTerm(Gtk.Window):
    def __init__(self):
        super().__init__(title="Hacker Term")
        self.set_default_size(1200, 800)
        if os.path.exists("icon.png"):
            self.set_icon_from_file("icon.png")

        # Enable dark theme with colorful accents
        settings = Gtk.Settings.get_default()
        settings.set_property("gtk-application-prefer-dark-theme", True)

        # Custom CSS for even prettier look: refined gradients, softer shadows, smaller buttons, more elegant transitions
        css_provider = Gtk.CssProvider()
        css = """
        window {
            background-color: rgba(18, 18, 18, 0.95); /* Semi-transparent dark background */
            font-family: 'Fira Code', monospace;
            font-size: 14pt;
            border-radius: 16px; /* Softer corners */
            box-shadow: 0 0 30px rgba(160, 160, 255, 0.5); /* Softer pastel blue glow */
            transition: box-shadow 0.3s ease-in-out;
        }
        window:hover {
            box-shadow: 0 0 35px rgba(160, 160, 255, 0.6); /* Glow on hover for interactivity */
        }
        notebook {
            background-color: rgba(26, 26, 26, 0.9);
            border: none;
        }
        notebook tab {
            background-color: rgba(26, 26, 26, 0.9);
            color: #E0E0E0;
            padding: 8px 12px; /* Slightly smaller padding for tabs */
            border-radius: 12px 12px 0 0; /* Smoother tab corners */
            border-bottom: none;
            box-shadow: inset 0 -3px 0 #444444;
            transition: background-color 0.2s, box-shadow 0.2s;
        }
        notebook tab:checked {
            background-color: rgba(18, 18, 18, 0.95);
            box-shadow: inset 0 -3px 0 #A0A0FF; /* Pastel blue accent */
        }
        notebook tab button {
            background-color: transparent;
            border: none;
            color: #E0E0E0;
            font-size: 10pt; /* Smaller font for close button */
            padding: 2px 6px; /* Smaller padding for close button */
            margin-left: 4px;
            border-radius: 50%; /* Circular close button for elegance */
            transition: color 0.2s, background-color 0.2s;
        }
        notebook tab button:hover {
            color: #FF9999; /* Pastel red hover */
            background-color: rgba(255, 153, 153, 0.1); /* Light overlay on hover */
        }
        vte-terminal {
            background-color: rgba(18, 18, 18, 0.85); /* Semi-transparent terminal bg */
            color: #E0E0E0;
            -VteTerminal-inner-border: 12;
            padding: 20px;
            box-shadow: inset 0 5px 15px rgba(0, 0, 0, 0.7), inset 0 -5px 15px rgba(0, 0, 0, 0.7);
            background-image: linear-gradient(to bottom, rgba(26, 26, 26, 0.9), rgba(18, 18, 18, 0.85));
            border-radius: 0 0 16px 16px; /* Matching window corners */
            transition: background-color 0.3s;
        }
        /* Cursor with vibrant pulse animation */
        vte-terminal {
            -VteTerminal-cursor-blink: on;
            -VteTerminal-cursor-shape: block;
            -VteTerminal-cursor-color: #A0A0FF;
        }
        /* Scrollbar - colorful, with gradients and hover glow */
        scrollbar {
            background-color: transparent;
            border: none;
            min-width: 10px;
        }
        scrollbar slider {
            background: linear-gradient(to right, #333333, #444444);
            border-radius: 5px;
            min-width: 8px;
            box-shadow: 0 0 8px rgba(160, 160, 255, 0.4);
            transition: background 0.3s, box-shadow 0.3s;
        }
        scrollbar slider:hover {
            background: linear-gradient(to right, #A0A0FF, #9999FF);
            box-shadow: 0 0 12px rgba(160, 160, 255, 0.6);
        }
        /* Menu styling - vibrant with gradients and smooth transitions */
        menubar {
            background: linear-gradient(to bottom, #1a1a1a, #121212);
            color: #E0E0E0;
            padding: 8px;
            border-bottom: 1px solid #444444;
        }
        menu {
            background: linear-gradient(to bottom, #1a1a1a, #121212);
            color: #E0E0E0;
            border: 1px solid #444444;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.8);
            border-radius: 10px;
        }
        menuitem {
            padding: 10px 15px;
            transition: background-color 0.2s;
        }
        menuitem:hover {
            background-color: #9999FF; /* Pastel blue hover */
            color: #121212;
            border-radius: 6px;
        }
        /* Header bar - colorful accents with subtle gradient */
        headerbar {
            background: linear-gradient(to bottom, #1a1a1a, #121212);
            color: #E0E0E0;
            box-shadow: none;
            border-bottom: 1px solid #444444;
            padding: 0 12px;
            border-radius: 16px 16px 0 0; /* Matching window */
        }
        button {
            background: linear-gradient(to bottom, #333333, #444444);
            color: #E0E0E0;
            border: none;
            border-radius: 6px;
            padding: 8px 15px;
            transition: background 0.3s;
        }
        button:hover {
            background: linear-gradient(to bottom, #A0A0FF, #9999FF);
            color: #121212;
        }
        /* Additional refinements for smoother look */
        * {
            transition: all 0.2s ease-in-out;
        }
        """
        css_provider.load_from_data(css.encode())
        Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), css_provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

        # Use HeaderBar for modern title bar
        header_bar = Gtk.HeaderBar()
        header_bar.set_show_close_button(True)
        header_bar.set_title("Hacker Term")
        self.set_titlebar(header_bar)

        # New tab button with nicer style
        new_tab_button = Gtk.Button(label="+")
        new_tab_button.connect("clicked", self.new_tab)
        header_bar.pack_start(new_tab_button)

        # Notebook for tabs
        self.notebook = Gtk.Notebook()
        self.notebook.set_tab_pos(Gtk.PositionType.TOP)
        self.notebook.set_scrollable(True)
        self.notebook.set_show_border(False)
        self.notebook.connect("switch-page", self.on_switch_page)

        # Add initial tab
        self.new_tab()

        # Add notebook to window
        self.add(self.notebook)

        # Connect signals
        self.connect("delete-event", self.on_delete_event)
        self.connect("key-press-event", self.on_key_press)

        # Zoom settings
        self.font_size = 14

        # Fullscreen flag
        self.fullscreened = False

        # Context menu - prettier with more options
        self.context_menu = Gtk.Menu()
        new_tab_ctx = Gtk.MenuItem(label="New Tab")
        new_tab_ctx.connect("activate", self.new_tab)
        close_tab_ctx = Gtk.MenuItem(label="Close Tab")
        close_tab_ctx.connect("activate", self.close_current_tab)
        copy_ctx = Gtk.MenuItem(label="Copy")
        copy_ctx.connect("activate", self.copy)
        paste_ctx = Gtk.MenuItem(label="Paste")
        paste_ctx.connect("activate", self.paste)
        select_all_ctx = Gtk.MenuItem(label="Select All")
        select_all_ctx.connect("activate", self.select_all)
        clear_ctx = Gtk.MenuItem(label="Clear")
        clear_ctx.connect("activate", self.clear)
        find_ctx = Gtk.MenuItem(label="Find")
        find_ctx.connect("activate", self.find)
        zoom_in_ctx = Gtk.MenuItem(label="Zoom In")
        zoom_in_ctx.connect("activate", self.zoom_in)
        zoom_out_ctx = Gtk.MenuItem(label="Zoom Out")
        zoom_out_ctx.connect("activate", self.zoom_out)
        zoom_normal_ctx = Gtk.MenuItem(label="Reset Zoom")
        zoom_normal_ctx.connect("activate", self.zoom_normal)
        self.context_menu.append(new_tab_ctx)
        self.context_menu.append(close_tab_ctx)
        self.context_menu.append(Gtk.SeparatorMenuItem())
        self.context_menu.append(copy_ctx)
        self.context_menu.append(paste_ctx)
        self.context_menu.append(select_all_ctx)
        self.context_menu.append(clear_ctx)
        self.context_menu.append(find_ctx)
        self.context_menu.append(Gtk.SeparatorMenuItem())
        self.context_menu.append(zoom_in_ctx)
        self.context_menu.append(zoom_out_ctx)
        self.context_menu.append(zoom_normal_ctx)
        self.context_menu.show_all()

        # Menu - use Gtk.Menu instead of MenuBar for popup
        self.menu = Gtk.Menu()

        # File submenu
        file_submenu = Gtk.Menu()
        file_item = Gtk.MenuItem(label="File")
        file_item.set_submenu(file_submenu)
        new_tab_item = Gtk.MenuItem(label="New Tab")
        new_tab_item.connect("activate", self.new_tab)
        close_tab_item = Gtk.MenuItem(label="Close Tab")
        close_tab_item.connect("activate", self.close_current_tab)
        quit_item = Gtk.MenuItem(label="Quit")
        quit_item.connect("activate", self.quit)
        file_submenu.append(new_tab_item)
        file_submenu.append(close_tab_item)
        file_submenu.append(Gtk.SeparatorMenuItem())
        file_submenu.append(quit_item)
        self.menu.append(file_item)

        # Edit submenu
        edit_submenu = Gtk.Menu()
        edit_item = Gtk.MenuItem(label="Edit")
        edit_item.set_submenu(edit_submenu)
        copy_item = Gtk.MenuItem(label="Copy")
        copy_item.connect("activate", self.copy)
        paste_item = Gtk.MenuItem(label="Paste")
        paste_item.connect("activate", self.paste)
        select_all_item = Gtk.MenuItem(label="Select All")
        select_all_item.connect("activate", self.select_all)
        find_item = Gtk.MenuItem(label="Find")
        find_item.connect("activate", self.find)
        clear_item = Gtk.MenuItem(label="Clear")
        clear_item.connect("activate", self.clear)
        edit_submenu.append(copy_item)
        edit_submenu.append(paste_item)
        edit_submenu.append(select_all_item)
        edit_submenu.append(find_item)
        edit_submenu.append(clear_item)
        self.menu.append(edit_item)

        # View submenu
        view_submenu = Gtk.Menu()
        view_item = Gtk.MenuItem(label="View")
        view_item.set_submenu(view_submenu)
        zoom_in_item = Gtk.MenuItem(label="Zoom In")
        zoom_in_item.connect("activate", self.zoom_in)
        zoom_out_item = Gtk.MenuItem(label="Zoom Out")
        zoom_out_item.connect("activate", self.zoom_out)
        zoom_normal_item = Gtk.MenuItem(label="Reset Zoom")
        zoom_normal_item.connect("activate", self.zoom_normal)
        fullscreen_item = Gtk.MenuItem(label="Toggle Fullscreen")
        fullscreen_item.connect("activate", self.toggle_fullscreen)
        view_submenu.append(zoom_in_item)
        view_submenu.append(zoom_out_item)
        view_submenu.append(zoom_normal_item)
        view_submenu.append(Gtk.SeparatorMenuItem())
        view_submenu.append(fullscreen_item)
        self.menu.append(view_item)

        self.menu.show_all()

        # Menu button in header
        menu_button = Gtk.MenuButton()
        menu_button.set_popup(self.menu)
        menu_button.set_direction(Gtk.ArrowType.DOWN)
        header_bar.pack_end(menu_button)

    def new_tab(self, widget=None):
        tab = TerminalTab(self)
        label = Gtk.Label(label="Terminal")
        close_button = Gtk.Button(label="x")
        close_button.connect("clicked", lambda w: self.close_tab(tab))
        hbox = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL)
        hbox.pack_start(label, False, False, 0)
        hbox.pack_start(close_button, False, False, 0)
        hbox.show_all()
        self.notebook.append_page(tab, hbox)
        self.notebook.set_tab_reorderable(tab, True)
        self.notebook.set_tab_detachable(tab, True)
        self.notebook.show_all()
        self.notebook.set_current_page(self.notebook.page_num(tab))
        tab.terminal.grab_focus()

    def close_tab(self, tab):
        page_num = self.notebook.page_num(tab)
        if page_num != -1:
            self.notebook.remove_page(page_num)
        if self.notebook.get_n_pages() == 0:
            self.quit()

    def close_current_tab(self, widget=None):
        current_page = self.notebook.get_current_page()
        if current_page != -1:
            tab = self.notebook.get_nth_page(current_page)
            self.close_tab(tab)

    def get_current_terminal(self):
        current_page = self.notebook.get_current_page()
        if current_page != -1:
            tab = self.notebook.get_nth_page(current_page)
            return tab.terminal
        return None

    def on_switch_page(self, notebook, page, page_num):
        terminal = page.terminal
        terminal.grab_focus()

    def on_button_press(self, widget, event):
        if event.button == 3:  # Right click
            self.context_menu.popup(None, None, None, None, event.button, event.time)
            return True
        return False

    def on_delete_event(self, widget, event):
        return False

    def quit(self, widget=None):
        Gtk.main_quit()

    def copy(self, widget=None):
        term = self.get_current_terminal()
        if term:
            term.copy_clipboard_format(Vte.Format.TEXT)

    def paste(self, widget=None):
        term = self.get_current_terminal()
        if term:
            term.paste_clipboard()

    def select_all(self, widget=None):
        term = self.get_current_terminal()
        if term:
            term.select_all()

    def clear(self, widget=None):
        term = self.get_current_terminal()
        if term:
            term.reset(True, True)

    def find(self, widget=None):
        term = self.get_current_terminal()
        if term:
            term.search_find_next()

    def zoom_in(self, widget=None):
        self.font_size += 1
        for i in range(self.notebook.get_n_pages()):
            tab = self.notebook.get_nth_page(i)
            tab.terminal.set_font(Pango.FontDescription(f"Fira Code {self.font_size}"))

    def zoom_out(self, widget=None):
        if self.font_size > 8:
            self.font_size -= 1
            for i in range(self.notebook.get_n_pages()):
                tab = self.notebook.get_nth_page(i)
                tab.terminal.set_font(Pango.FontDescription(f"Fira Code {self.font_size}"))

    def zoom_normal(self, widget=None):
        self.font_size = 14
        for i in range(self.notebook.get_n_pages()):
            tab = self.notebook.get_nth_page(i)
            tab.terminal.set_font(Pango.FontDescription("Fira Code 14"))

    def toggle_fullscreen(self, widget=None):
        if self.fullscreened:
            self.unfullscreen()
            self.fullscreened = False
        else:
            self.fullscreen()
            self.fullscreened = True

    def on_key_press(self, widget, event):
        keyval = event.keyval
        state = event.state & Gtk.accelerator_get_default_mod_mask()

        if state == Gdk.ModifierType.CONTROL_MASK:
            if keyval == Gdk.KEY_t:
                self.new_tab()
                return True
            elif keyval == Gdk.KEY_w:
                self.close_current_tab()
                return True
            elif keyval == Gdk.KEY_q:
                self.quit()
                return True
            elif keyval == Gdk.KEY_r:
                self.clear()
                return True
            elif keyval == Gdk.KEY_plus or keyval == Gdk.KEY_equal:
                self.zoom_in()
                return True
            elif keyval == Gdk.KEY_minus:
                self.zoom_out()
                return True
            elif keyval == Gdk.KEY_0:
                self.zoom_normal()
                return True
            elif keyval == Gdk.KEY_f:
                self.find()
                return True
        return False

if __name__ == "__main__":
    win = HackerTerm()
    win.connect("destroy", Gtk.main_quit)
    win.show_all()
    Gtk.main()

