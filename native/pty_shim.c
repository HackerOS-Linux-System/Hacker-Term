#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <pty.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

#define MAX_SESS 64
#define RD_CHUNK 12288 /* bajty surowe -> ~16 KB base64 */

typedef struct { int used; int fd; pid_t pid; int dead; } Sess;
static Sess g_s[MAX_SESS];
static char g_out[RD_CHUNK * 4 / 3 + 8];
static char g_cwd[4096];

static const char B64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static int b64_dec_char(int c) {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1;
}

static size_t b64_encode(const unsigned char *in, size_t n, char *out) {
    size_t o = 0;
    for (size_t i = 0; i < n; i += 3) {
        unsigned v = in[i] << 16;
        if (i + 1 < n) v |= in[i + 1] << 8;
        if (i + 2 < n) v |= in[i + 2];
        out[o++] = B64[(v >> 18) & 63];
        out[o++] = B64[(v >> 12) & 63];
        out[o++] = i + 1 < n ? B64[(v >> 6) & 63] : '=';
        out[o++] = i + 2 < n ? B64[v & 63] : '=';
    }
    out[o] = 0;
    return o;
}

static Sess *get(int h) {
    if (h < 1 || h > MAX_SESS || !g_s[h - 1].used) return NULL;
    return &g_s[h - 1];
}

/* shell: "" = auto (zsh -> $SHELL -> bash -> sh); cwd: "" = $HOME;
 * env: linie "KLUCZ=WARTOŚĆ" rozdzielone '\n'. Zwraca uchwyt (>0) albo -1. */
int ht_pty_open(int cols, int rows, const char *shell, const char *cwd, const char *env) {
    int slot = -1;
    for (int i = 0; i < MAX_SESS; i++) if (!g_s[i].used) { slot = i; break; }
    if (slot < 0) return -1;
    struct winsize ws = { (unsigned short)(rows > 0 ? rows : 24), (unsigned short)(cols > 0 ? cols : 80), 0, 0 };
    int fd;
    pid_t pid = forkpty(&fd, NULL, NULL, &ws);
    if (pid < 0) return -1;
    if (pid == 0) {
        const char *sh = (shell && *shell) ? shell : NULL;
        char buf[256];
        if (!sh) {
            if (access("/usr/bin/zsh", X_OK) == 0) sh = "/usr/bin/zsh";
            else if (access("/bin/zsh", X_OK) == 0) sh = "/bin/zsh";
            else if (getenv("SHELL") && *getenv("SHELL")) sh = getenv("SHELL");
            else if (access("/bin/bash", X_OK) == 0) sh = "/bin/bash";
            else sh = "/bin/sh";
        } else if (sh[0] != '/') { /* nazwa bez ścieżki: szukaj w typowych katalogach */
            static const char *dirs[] = { "/usr/bin/", "/bin/", "/usr/local/bin/", NULL };
            const char *found = NULL;
            for (int d = 0; dirs[d]; d++) {
                snprintf(buf, sizeof buf, "%s%s", dirs[d], sh);
                if (access(buf, X_OK) == 0) { found = buf; break; }
            }
            sh = found; /* NULL -> wybór automatyczny poniżej */
        }
        if (!sh) {
            if (access("/usr/bin/zsh", X_OK) == 0) sh = "/usr/bin/zsh";
            else if (getenv("SHELL") && *getenv("SHELL")) sh = getenv("SHELL");
            else if (access("/bin/bash", X_OK) == 0) sh = "/bin/bash";
            else sh = "/bin/sh";
        }
        setenv("TERM", "xterm-256color", 1);
        setenv("COLORTERM", "truecolor", 1);
        setenv("TERM_PROGRAM", "HackerTerm", 1);
        if (env && *env) {
            char *copy = strdup(env), *save = NULL;
            for (char *ln = strtok_r(copy, "\n", &save); ln; ln = strtok_r(NULL, "\n", &save)) {
                char *eq = strchr(ln, '=');
                if (eq && eq != ln) { *eq = 0; setenv(ln, eq + 1, 1); }
            }
            free(copy);
        }
        const char *dir = (cwd && *cwd) ? cwd : getenv("HOME");
        if (dir && chdir(dir) != 0 && getenv("HOME")) { if (chdir(getenv("HOME")) != 0) {} }
        signal(SIGPIPE, SIG_DFL);
        /* powłoka logowania nie jest potrzebna; argv[0] = nazwa powłoki */
        const char *base = strrchr(sh, '/'); base = base ? base + 1 : sh;
        execl(sh, base, (char *)NULL);
        _exit(127);
    }
    fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK);
    fcntl(fd, F_SETFD, FD_CLOEXEC);
    g_s[slot].used = 1; g_s[slot].fd = fd; g_s[slot].pid = pid; g_s[slot].dead = 0;
    return slot + 1;
}

/* Nieblokujący odczyt: base64 dostępnych bajtów ("" gdy brak). Wskaźnik ważny do następnego wywołania. */
const char *ht_pty_read(int h) {
    g_out[0] = 0;
    Sess *s = get(h);
    if (!s || s->dead) return g_out;
    unsigned char raw[RD_CHUNK];
    ssize_t n = read(s->fd, raw, sizeof raw);
    if (n > 0) b64_encode(raw, (size_t)n, g_out);
    else if (n == 0 || (n < 0 && errno != EAGAIN && errno != EINTR)) s->dead = 1; /* EIO = potomek zakończył pracę */
    return g_out;
}

/* Zapisuje dane (base64). Zwraca liczbę bajtów albo -1. */
int ht_pty_write(int h, const char *b64) {
    Sess *s = get(h);
    if (!s || s->dead || !b64) return -1;
    size_t len = strlen(b64);
    unsigned char *buf = malloc(len / 4 * 3 + 3);
    if (!buf) return -1;
    size_t o = 0; int acc = 0, bits = 0;
    for (size_t i = 0; i < len; i++) {
        int v = b64_dec_char((unsigned char)b64[i]);
        if (v < 0) continue;
        acc = (acc << 6) | v; bits += 6;
        if (bits >= 8) { bits -= 8; buf[o++] = (unsigned char)((acc >> bits) & 0xFF); }
    }
    size_t done = 0;
    int tries = 0;
    while (done < o) {
        ssize_t w = write(s->fd, buf + done, o - done);
        if (w > 0) { done += (size_t)w; tries = 0; }
        else if (w < 0 && (errno == EAGAIN || errno == EINTR)) { if (++tries > 2000) break; usleep(500); }
        else break;
    }
    free(buf);
    return done == o ? (int)o : -1;
}

int ht_pty_resize(int h, int cols, int rows) {
    Sess *s = get(h);
    if (!s || s->dead || cols < 1 || rows < 1) return -1;
    struct winsize ws = { (unsigned short)rows, (unsigned short)cols, 0, 0 };
    return ioctl(s->fd, TIOCSWINSZ, &ws);
}

/* 1 = działa, 0 = zakończony (zebrany), -1 = nieznany uchwyt */
int ht_pty_alive(int h) {
    Sess *s = get(h);
    if (!s) return -1;
    if (!s->dead) {
        int st;
        pid_t r = waitpid(s->pid, &st, WNOHANG);
        if (r == s->pid) s->dead = 1;
    }
    return s->dead ? 0 : 1;
}

/* Bieżący katalog roboczy powłoki (Linux: /proc/<pid>/cwd) — do zapisu sesji. */
const char *ht_pty_cwd(int h) {
    g_cwd[0] = 0;
    Sess *s = get(h);
    if (!s || s->dead) return g_cwd;
    char link[64];
    snprintf(link, sizeof link, "/proc/%d/cwd", (int)s->pid);
    ssize_t n = readlink(link, g_cwd, sizeof g_cwd - 1);
    if (n > 0) g_cwd[n] = 0; else g_cwd[0] = 0;
    return g_cwd;
}

int ht_pty_close(int h) {
    Sess *s = get(h);
    if (!s) return -1;
    close(s->fd);
    if (!s->dead) {
        kill(s->pid, SIGHUP);
        int st;
        if (waitpid(s->pid, &st, WNOHANG) == 0) { usleep(20000); if (waitpid(s->pid, &st, WNOHANG) == 0) { kill(s->pid, SIGKILL); waitpid(s->pid, &st, 0); } }
    }
    memset(s, 0, sizeof *s);
    return 0;
}
