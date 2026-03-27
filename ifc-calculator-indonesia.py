#!/usr/bin/env python3
"""
Indonesia IFC Calculator — GUI Tkinter
Hitung volume/luas: Lantai, Plafond, Dinding, Pintu, Jendela
Jalankan: python ifc_volume_tkinter.py
"""

import sys
import os
import csv
import threading
from collections import defaultdict

try:
    import tkinter as tk
    from tkinter import ttk, filedialog, messagebox
except ImportError:
    print("ERROR: tkinter tidak tersedia.")
    sys.exit(1)

try:
    import ifcopenshell
    import ifcopenshell.util.element
    import ifcopenshell.geom
except ImportError:
    print("ERROR: ifcopenshell belum terinstall.\nJalankan: pip install ifcopenshell")
    sys.exit(1)


# ══════════════════════════════════════════════════════
#  KONSTANTA
# ══════════════════════════════════════════════════════

FLOOR_SLAB_TYPES = {"FLOOR", "BASESLAB", "LANDING"}
CEILING_KEYWORDS = {"plafond", "ceiling", "langit-langit", "langit"}
ALL_CATEGORIES = ["Lantai", "Plafond", "Dinding", "Pintu", "Jendela"]

# Warna baris per kategori: (bg_genap, bg_ganjil, fg)
COLORS = {
    "Lantai":  ("#f5f5f5", "#ebebeb", "#1a1a1a"),
    "Plafond": ("#f5f5f5", "#ebebeb", "#1a1a1a"),
    "Dinding": ("#fff2f2", "#ffe8e8", "#8b0000"),
    "Pintu":   ("#fff8f8", "#ffeeee", "#c0392b"),
    "Jendela": ("#fff4f4", "#ffeaea", "#a93226"),
}

# Kolom dimensi tambahan per kategori (kolom col3, col4)
COL_META = {
    "Lantai":  [("tebal_m",  "Tebal (m)"),  (None, "")],
    "Plafond": [("tebal_m",  "Tebal (m)"),  (None, "")],
    "Dinding": [("panjang_m", "Panjang (m)"), ("tinggi_m", "Tinggi (m)")],
    "Pintu":   [("lebar_m",  "Lebar (m)"),  ("tinggi_m", "Tinggi (m)")],
    "Jendela": [("lebar_m",  "Lebar (m)"),  ("tinggi_m", "Tinggi (m)")],
}

# Palet warna aplikasi
C = {
    "bg":        "#f0f0f0",
    "surface":   "#ffffff",
    "border":    "#d0d0d0",
    "hdr_bg":    "#c0392b",
    "hdr_fg":    "#ffffff",
    "accent":    "#c0392b",
    "accent2":   "#e74c3c",
    "btn_bg":    "#c0392b",
    "btn_fg":    "#ffffff",
    "btn2_bg":   "#e0e0e0",
    "btn2_fg":   "#1a1a1a",
    "text":      "#1a1a1a",
    "muted":     "#666666",
    "footer_bg": "#e0e0e0",
    "sel_bg":    "#c0392b",
    "hdg_bg":    "#e0e0e0",
}


# ══════════════════════════════════════════════════════
#  LOGIKA PERHITUNGAN
# ══════════════════════════════════════════════════════

def get_storey(el):
    for rel in getattr(el, "ContainedInStructure", []):
        s = rel.RelatingStructure
        if s.is_a("IfcBuildingStorey"):
            return s.Name or "Tanpa Nama"
    return "—"


def get_from_qto(el):
    d = {}
    for defn in getattr(el, "IsDefinedBy", []):
        if not defn.is_a("IfcRelDefinesByProperties"):
            continue
        pd = defn.RelatingPropertyDefinition
        if not pd.is_a("IfcElementQuantity"):
            continue
        for q in pd.Quantities:
            n, nl = q.Name, q.Name.lower()
            if q.is_a("IfcQuantityVolume"):
                d.setdefault("volume", q.VolumeValue)
            elif q.is_a("IfcQuantityArea"):
                d.setdefault("area", q.AreaValue)
            elif q.is_a("IfcQuantityLength"):
                if any(x in nl for x in ("height", "tinggi")):
                    d.setdefault("height", q.LengthValue)
                if any(x in nl for x in ("width", "lebar", "nominal")):
                    d.setdefault("width", q.LengthValue)
                if any(x in nl for x in ("length", "panjang")):
                    d.setdefault("length", q.LengthValue)
                if any(x in nl for x in ("thickness", "depth", "tebal")):
                    d.setdefault("thickness", q.LengthValue)
    return d


def get_from_pset(el):
    d = {}
    for _, props in ifcopenshell.util.element.get_psets(el, qtos_only=False).items():
        for k, v in props.items():
            if not isinstance(v, (int, float)):
                continue
            kl = k.lower().replace(" ", "")
            if "volume" in kl:
                d.setdefault("volume", float(v))
            if "area" in kl or "luas" in kl:
                d.setdefault("area", float(v))
            if "height" in kl or "tinggi" in kl:
                d.setdefault("height", float(v))
            if "width" in kl or "lebar" in kl:
                d.setdefault("width",  float(v))
            if "length" in kl or "panjang" in kl:
                d.setdefault("length", float(v))
            if "thickness" in kl or "tebal" in kl:
                d.setdefault("thickness", float(v))
    return d


def get_from_geom(el):
    try:
        s = ifcopenshell.geom.settings()
        s.set(s.USE_WORLD_COORDS, True)
        shape = ifcopenshell.geom.create_shape(s, el)
        v = shape.geometry.verts
        if not v:
            return {}
        xs, ys, zs = v[0::3], v[1::3], v[2::3]
        dx = round(max(xs)-min(xs), 4)
        dy = round(max(ys)-min(ys), 4)
        dz = round(max(zs)-min(zs), 4)
        dims = sorted([dx, dy, dz])
        thick = dims[0]
        area = round(dims[1]*dims[2], 4)
        return {"volume": round(area*thick, 6), "area": area,
                "thickness": thick, "height": dz,
                "width": round(min(dx, dy), 4), "length": round(max(dx, dy), 4)}
    except Exception:
        return {}


def resolve(el):
    d = get_from_qto(el)
    for k, v in get_from_pset(el).items():
        d.setdefault(k, v)
    if not d.get("volume"):
        for k, v in get_from_geom(el).items():
            d.setdefault(k, v)
    return d


def make_rec(el, kategori, source):
    d = resolve(el)
    def R(v, n=4): return round(v, n) if v is not None else None
    return {
        "kategori":  kategori,
        "tipe_ifc":  el.is_a(),
        "predefined": (getattr(el, "PredefinedType", None) or "NOTDEFINED").upper(),
        "nama":      el.Name or "(tanpa nama)",
        "global_id": el.GlobalId,
        "lantai":    get_storey(el),
        "sumber":    source,
        "volume_m3": R(d.get("volume"), 6),
        "luas_m2":   R(d.get("area"), 4),
        "tebal_m":   R(d.get("thickness"), 4),
        "tinggi_m":  R(d.get("height"), 4),
        "lebar_m":   R(d.get("width"), 4),
        "panjang_m": R(d.get("length"), 4),
    }


def safe_by_type(model, t):
    try:
        return model.by_type(t)
    except:
        return []


def collect(model):
    res = []

    # Lantai & Plafond — IfcSlab
    for s in safe_by_type(model, "IfcSlab"):
        pt = (s.PredefinedType or "NOTDEFINED").upper()
        nl = (s.Name or "").lower()
        if pt in FLOOR_SLAB_TYPES:
            res.append(make_rec(s, "Lantai", "IfcSlab"))
        elif any(k in nl for k in CEILING_KEYWORDS):
            res.append(make_rec(s, "Plafond", "IfcSlab(nama)"))
        elif pt in ("NOTDEFINED", "USERDEFINED"):
            if any(k in nl for k in CEILING_KEYWORDS):
                res.append(make_rec(s, "Plafond", "IfcSlab(nama)"))
            else:
                res.append(make_rec(s, "Lantai", "IfcSlab"))

    # Lantai & Plafond — IfcCovering
    for c in safe_by_type(model, "IfcCovering"):
        pt = (c.PredefinedType or "NOTDEFINED").upper()
        nl = (c.Name or "").lower()
        if pt == "CEILING":
            res.append(make_rec(c, "Plafond", "IfcCovering"))
        elif pt == "FLOORING":
            res.append(make_rec(c, "Lantai", "IfcCovering"))
        elif pt in ("NOTDEFINED", "USERDEFINED"):
            kat = "Plafond" if any(
                k in nl for k in CEILING_KEYWORDS) else "Lantai"
            res.append(make_rec(c, kat, "IfcCovering(nama)"))

    # Dinding
    seen = set()
    for w in list(safe_by_type(model, "IfcWall")) + list(safe_by_type(model, "IfcWallStandardCase")):
        if w.GlobalId not in seen:
            seen.add(w.GlobalId)
            res.append(make_rec(w, "Dinding", w.is_a()))

    # Pintu & Jendela
    for d in safe_by_type(model, "IfcDoor"):
        res.append(make_rec(d, "Pintu", "IfcDoor"))
    for w in safe_by_type(model, "IfcWindow"):
        res.append(make_rec(w, "Jendela", "IfcWindow"))

    return res


def model_info(model):
    def sc(t): return len(safe_by_type(model, t))
    return {
        "schema":   model.schema,
        "n_slab":   sc("IfcSlab"), "n_cov": sc("IfcCovering"),
        "n_wall":   sc("IfcWall")+sc("IfcWallStandardCase"),
        "n_door":   sc("IfcDoor"), "n_win": sc("IfcWindow"),
        "n_storey": sc("IfcBuildingStorey"),
    }


# ══════════════════════════════════════════════════════
#  GUI
# ══════════════════════════════════════════════════════

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Indonesia IFC Calculator")
        self.geometry("1200x700")
        self.minsize(900, 500)
        self.configure(bg=C["bg"])
        self.all_data = []
        self.sort_col = None
        self.sort_rev = False
        self._path = None
        self._build()

    def _build(self):
        st = ttk.Style(self)
        st.theme_use("clam")
        st.configure("Treeview", background=C["surface"], foreground=C["text"],
                     fieldbackground=C["surface"], rowheight=25, borderwidth=0,
                     font=("Segoe UI", 9))
        st.configure("Treeview.Heading", background=C["hdg_bg"], foreground=C["text"],
                     font=("Segoe UI", 9, "bold"), borderwidth=0, relief="flat")
        st.map("Treeview",
               background=[("selected", C["sel_bg"])],
               foreground=[("selected", "#ffffff")])
        st.map("Treeview.Heading", background=[("active", "#c8c8c8")])
        for sc in ("Vertical", "Horizontal"):
            st.configure(f"{sc}.TScrollbar",
                         background=C["border"], troughcolor=C["bg"], borderwidth=0)

        # Header
        hdr = tk.Frame(self, bg=C["hdr_bg"], height=48)
        hdr.pack(fill="x")
        hdr.pack_propagate(False)
        tk.Label(hdr, text="  🏗  Indonesia IFC Calculator",
                 bg=C["hdr_bg"], fg=C["hdr_fg"],
                 font=("Segoe UI", 13, "bold")).pack(side="left", pady=6)
        self.lbl_schema = tk.Label(hdr, text="", bg=C["hdr_bg"], fg="#ffcccc",
                                   font=("Consolas", 8))
        self.lbl_schema.pack(side="right", padx=12)

        # Toolbar
        tb = tk.Frame(self, bg=C["bg"], pady=6, padx=8)
        tb.pack(fill="x")

        def mkbtn(t, cmd, primary=True, st="normal"):
            bg = C["btn_bg"] if primary else C["btn2_bg"]
            fg = C["btn_fg"] if primary else C["btn2_fg"]
            abg = C["accent2"] if primary else "#c8c8c8"
            return tk.Button(tb, text=t, command=cmd, bg=bg, fg=fg,
                             activebackground=abg, activeforeground=fg,
                             font=("Segoe UI", 9, "bold"), relief="flat",
                             cursor="hand2", padx=11, pady=4, state=st)

        mkbtn("📂  Buka File IFC", self.open_file).pack(
            side="left", padx=(0, 5))
        self.btn_exp = mkbtn("⬇  Export CSV", self.do_export,
                             primary=False, st="disabled")
        self.btn_exp.pack(side="left", padx=(0, 14))

        def lbl(t): return tk.Label(tb, text=t, bg=C["bg"], fg=C["muted"],
                                    font=("Segoe UI", 9))

        lbl("Kategori:").pack(side="left", padx=(0, 3))
        self.v_kat = tk.StringVar(value="Semua")
        self.cb_kat = ttk.Combobox(tb, textvariable=self.v_kat,
                                   values=["Semua"]+ALL_CATEGORIES,
                                   width=10, state="readonly", font=("Segoe UI", 9))
        self.cb_kat.pack(side="left", padx=(0, 10))
        self.cb_kat.bind("<<ComboboxSelected>>", lambda _: self.refresh())

        lbl("Lantai:").pack(side="left", padx=(0, 3))
        self.v_storey = tk.StringVar(value="Semua")
        self.cb_storey = ttk.Combobox(tb, textvariable=self.v_storey,
                                      width=14, state="readonly", font=("Segoe UI", 9))
        self.cb_storey.pack(side="left", padx=(0, 10))
        self.cb_storey.bind("<<ComboboxSelected>>", lambda _: self.refresh())

        lbl("Cari:").pack(side="left", padx=(0, 3))
        self.v_search = tk.StringVar()
        self.v_search.trace_add("write", lambda *_: self.refresh())
        tk.Entry(tb, textvariable=self.v_search, width=22,
                 bg=C["surface"], fg=C["text"], insertbackground=C["text"],
                 relief="sunken", font=("Segoe UI", 9)).pack(side="left")

        # Info bar
        ib = tk.Frame(self, bg=C["surface"],
                      highlightbackground=C["border"], highlightthickness=1, pady=4)
        ib.pack(fill="x")
        self.lbl_info = tk.Label(ib, text="Belum ada file IFC dibuka.",
                                 bg=C["surface"], fg=C["muted"],
                                 font=("Segoe UI", 9), anchor="w", padx=10)
        self.lbl_info.pack(side="left")
        self.lbl_cnt = tk.Label(ib, text="", bg=C["surface"], fg=C["text"],
                                font=("Segoe UI", 9), anchor="e", padx=10)
        self.lbl_cnt.pack(side="right")

        # Tabel
        tf = tk.Frame(self, bg=C["bg"])
        tf.pack(fill="both", expand=True, padx=8, pady=(3, 0))

        cols = ("kategori", "nama", "lantai", "tipe_ifc",
                "luas_m2", "col3", "col4", "volume_m3", "sumber")
        self.tree = ttk.Treeview(tf, columns=cols, show="headings",
                                 selectmode="browse")

        self._hdr_defs = {
            "kategori": ("Kategori",    90, "center"),
            "nama":     ("Nama Elemen", 255, "w"),
            "lantai":   ("Lantai",     120, "w"),
            "tipe_ifc": ("Tipe IFC",   125, "center"),
            "luas_m2":  ("Luas (m²)",   88, "e"),
            "col3":     ("Tebal (m)",   80, "e"),
            "col4":     ("",             0, "e"),
            "volume_m3": ("Volume (m³)", 98, "e"),
            "sumber":   ("Sumber",     100, "center"),
        }
        for col, (txt, w, anc) in self._hdr_defs.items():
            self.tree.heading(
                col, text=txt, command=lambda c=col: self.sort_by(c))
            self.tree.column(col, width=w, anchor=anc, minwidth=0)

        for kat in ALL_CATEGORIES:
            bg_e, bg_o, fg = COLORS[kat]
            self.tree.tag_configure(
                kat,         background=bg_e, foreground=fg)
            self.tree.tag_configure(
                kat+"_odd",  background=bg_o, foreground=fg)
        self.tree.tag_configure(
            "no_data", background="#fff0f0", foreground="#c0392b")

        vsb = ttk.Scrollbar(tf, orient="vertical",   command=self.tree.yview)
        hsb = ttk.Scrollbar(tf, orient="horizontal", command=self.tree.xview)
        self.tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)
        hsb.pack(side="bottom", fill="x")
        vsb.pack(side="right",  fill="y")
        self.tree.pack(fill="both", expand=True)

        # Footer
        ft = tk.Frame(self, bg=C["footer_bg"], pady=5)
        ft.pack(fill="x")
        self.lbl_footer = tk.Label(ft, text="Buka file IFC untuk mulai menghitung.",
                                   bg=C["footer_bg"], fg=C["muted"],
                                   font=("Segoe UI", 9), anchor="w", padx=10)
        self.lbl_footer.pack(side="left")

        # Loading
        self.lbl_load = tk.Label(self, text="⏳  Memproses file IFC...",
                                 bg=C["bg"], fg=C["accent"],
                                 font=("Segoe UI", 13, "bold"))

    # ── File ──────────────────────────────────────────

    def open_file(self):
        p = filedialog.askopenfilename(
            title="Pilih File IFC",
            filetypes=[("IFC Files", "*.ifc"), ("All Files", "*.*")])
        if not p:
            return
        self._path = p
        self._show_load(True)
        threading.Thread(target=self._load, args=(p,), daemon=True).start()

    def _load(self, path):
        try:
            m = ifcopenshell.open(path)
            info = model_info(m)
            els = collect(m)
            del m
            self.after(0, self._done, els, info, path)
        except Exception as e:
            import traceback
            self.after(0, self._err, str(e), traceback.format_exc())

    def _done(self, els, info, path):
        self._show_load(False)
        self.all_data = els
        fname = os.path.basename(path)
        by_k = defaultdict(int)
        for e in els:
            by_k[e["kategori"]] += 1
        n_nov = sum(1 for e in els if e["volume_m3"]
                    is None and e["luas_m2"] is None)

        self.lbl_schema.config(
            text=f"  {info['schema']}  Slab:{info['n_slab']}  "
            f"Cov:{info['n_cov']}  Wall:{info['n_wall']}  "
            f"Door:{info['n_door']}  Win:{info['n_win']}  "
            f"Storey:{info['n_storey']}  ")

        cnt = "  ".join(f"{k}:{by_k[k]}" for k in ALL_CATEGORIES if by_k[k])
        self.lbl_info.config(text=f"  {fname}  —  {cnt}"
                             + (f"  ⚠{n_nov} tanpa data" if n_nov else ""))

        storeys = sorted({e["lantai"] for e in els})
        self.cb_storey["values"] = ["Semua"] + storeys
        self.v_storey.set("Semua")
        self.btn_exp.config(state="normal")
        self.refresh()

    def _err(self, err, tb):
        self._show_load(False)
        messagebox.showerror("Gagal Membuka File",
                             f"Error:\n{err}\n\nDetail:\n{tb[:600]}")

    def _show_load(self, show):
        if show:
            self.lbl_load.place(relx=.5, rely=.5, anchor="center")
        else:
            self.lbl_load.place_forget()

    # ── Tabel ─────────────────────────────────────────

    def _update_cols(self, kat):
        meta = COL_META.get(kat, COL_META["Dinding"])
        k3, l3 = meta[0]
        k4, l4 = meta[1]
        self.tree.heading("col3", text=l3)
        self.tree.column("col3", width=80 if l3 else 0)
        self.tree.heading("col4", text=l4)
        self.tree.column("col4", width=80 if l4 else 0)
        return k3, k4

    def _filtered(self):
        kat = self.v_kat.get()
        storey = self.v_storey.get()
        s = self.v_search.get().lower()
        return [e for e in self.all_data
                if (kat == "Semua" or e["kategori"] == kat)
                and (storey == "Semua" or e["lantai"] == storey)
                and (not s or s in e["nama"].lower())]

    def refresh(self):
        kat = self.v_kat.get()
        # Jika "Semua", kolom col3=Dim-3, col4=Dim-4
        if kat == "Semua":
            self.tree.heading("col3", text="Dim-3 (m)")
            self.tree.column("col3", width=80)
            self.tree.heading("col4", text="Dim-4 (m)")
            self.tree.column("col4", width=80)
        else:
            self._update_cols(kat)

        rows = self._filtered()

        if self.sort_col:
            def key(e):
                col = self.sort_col
                # col3/col4 → field asli berdasarkan kategori elemen
                if col in ("col3", "col4"):
                    meta = COL_META.get(e["kategori"], COL_META["Dinding"])
                    idx = 0 if col == "col3" else 1
                    field = meta[idx][0]
                    v = e.get(field) if field else None
                else:
                    v = e.get(col)
                if v is None:
                    return 1e18 if not self.sort_rev else -1e18
                return v if isinstance(v, (int, float)) else str(v)
            rows.sort(key=key, reverse=self.sort_rev)

        for item in self.tree.get_children():
            self.tree.delete(item)

        for i, e in enumerate(rows):
            luas = f"{e['luas_m2']:.3f}" if e["luas_m2"] is not None else "—"
            vol = f"{e['volume_m3']:.4f}" if e["volume_m3"] is not None else "—"

            # col3/col4 sesuai kategori elemen
            meta = COL_META.get(e["kategori"], COL_META["Dinding"])
            k3, _ = meta[0]
            k4, _ = meta[1]
            v3 = e.get(k3)
            v4 = e.get(k4)
            c3 = f"{v3:.4f}" if v3 is not None else "—"
            c4 = f"{v4:.4f}" if v4 is not None else ("—" if k4 else "")

            ek = e["kategori"]
            if e["volume_m3"] is None and e["luas_m2"] is None:
                tag = "no_data"
            else:
                tag = ek if i % 2 == 0 else ek + "_odd"

            self.tree.insert("", "end", values=(
                ek, e["nama"], e["lantai"], e["tipe_ifc"],
                luas, c3, c4, vol, e["sumber"]
            ), tags=(tag,))

        total_l = sum(e["luas_m2"] or 0 for e in rows)
        total_v = sum(e["volume_m3"] or 0 for e in rows)
        n_nov = sum(1 for e in rows if e["volume_m3"]
                    is None and e["luas_m2"] is None)

        by_k = defaultdict(int)
        for e in rows:
            by_k[e["kategori"]] += 1
        ktxt = "  ".join(f"{k}={v}" for k, v in by_k.items())

        self.lbl_footer.config(
            text=f"  {len(rows)} elemen  ({ktxt})   "
            f"Luas={total_l:.3f} m²   Volume={total_v:.4f} m³"
            + (f"   ⚠{n_nov} tanpa data" if n_nov else ""))
        self.lbl_cnt.config(
            text="  ".join(f"{k}:{by_k[k]}" for k in ALL_CATEGORIES if by_k[k])+"  ")

    def sort_by(self, col):
        self.sort_rev = not self.sort_rev if self.sort_col == col else False
        self.sort_col = col
        self.refresh()

    # ── Export ────────────────────────────────────────

    def do_export(self):
        if not self.all_data:
            return
        path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            initialfile=os.path.splitext(os.path.basename(
                self._path or "hasil"))[0]+"_ifc.csv",
            filetypes=[("CSV", "*.csv")])
        if not path:
            return
        rows = self._filtered()
        fields = ["kategori", "tipe_ifc", "predefined", "nama", "lantai",
                  "luas_m2", "tebal_m", "tinggi_m", "lebar_m", "panjang_m",
                  "volume_m3", "sumber", "global_id"]
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            for e in rows:
                w.writerow({k: ("" if e.get(k) is None else e.get(k, ""))
                           for k in fields})
        messagebox.showinfo("Export Berhasil", f"File disimpan:\n{path}")


if __name__ == "__main__":
    App().mainloop()
