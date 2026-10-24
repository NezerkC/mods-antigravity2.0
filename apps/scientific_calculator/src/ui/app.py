"""CustomTkinter GUI application for the scientific calculator."""
import customtkinter as ctk
from typing import Optional
from ..domain.engine import CalculatorEngine
from .presenter import CalculatorPresenter

class ScientificCalculatorApp(ctk.CTk):
    """Main window of the scientific calculator using CustomTkinter."""

    def __init__(self):
        super().__init__()

        # Appearance configuration
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        self.title("Calculadora Científica Modular")
        self.geometry("460x660")
        self.minsize(440, 620)

        # Core Engine & Presenter
        self.engine = CalculatorEngine()
        self.presenter = CalculatorPresenter(self.engine, on_state_changed=self._update_display)

        # UI Components
        self._setup_ui()
        self._bind_keyboard()
        self._update_display()

    def _setup_ui(self):
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        # 1. Header Frame (Mode & Theme)
        header_frame = ctk.CTkFrame(self, fg_color="transparent")
        header_frame.grid(row=0, column=0, padx=16, pady=(12, 4), sticky="ew")
        header_frame.grid_columnconfigure(1, weight=1)

        self.mode_btn = ctk.CTkButton(
            header_frame,
            text="DEG",
            width=64,
            height=28,
            corner_radius=14,
            font=ctk.CTkFont(size=12, weight="bold"),
            command=self._toggle_angle_mode
        )
        self.mode_btn.grid(row=0, column=0, sticky="w")

        self.theme_switch = ctk.CTkSwitch(
            header_frame,
            text="Oscuro",
            font=ctk.CTkFont(size=12),
            command=self._toggle_theme,
            onvalue="dark",
            offvalue="light"
        )
        self.theme_switch.select()
        self.theme_switch.grid(row=0, column=2, sticky="e")

        # 2. Display Frame
        display_frame = ctk.CTkFrame(self, corner_radius=12, fg_color=("gray85", "gray17"))
        display_frame.grid(row=1, column=0, padx=16, pady=8, sticky="ew")
        display_frame.grid_columnconfigure(0, weight=1)

        self.history_label = ctk.CTkLabel(
            display_frame,
            text="",
            font=ctk.CTkFont(size=14),
            text_color=("gray40", "gray65"),
            anchor="e"
        )
        self.history_label.grid(row=0, column=0, padx=16, pady=(10, 2), sticky="ew")

        self.main_display = ctk.CTkLabel(
            display_frame,
            text="0",
            font=ctk.CTkFont(size=32, weight="bold"),
            anchor="e"
        )
        self.main_display.grid(row=1, column=0, padx=16, pady=(2, 12), sticky="ew")

        # 3. Keypad Frame
        keypad_frame = ctk.CTkFrame(self, fg_color="transparent")
        keypad_frame.grid(row=2, column=0, padx=16, pady=(4, 16), sticky="nsew")

        for col in range(5):
            keypad_frame.grid_columnconfigure(col, weight=1)
        for row in range(7):
            keypad_frame.grid_rowconfigure(row, weight=1)

        # Button Layout: (label, action_type, action_arg, fg_color, hover_color)
        btn_layout = [
            # Row 0: Scientific Transcendental
            [("sin", "fn", "sin"), ("cos", "fn", "cos"), ("tan", "fn", "tan"), ("log", "fn", "log10"), ("ln", "fn", "ln")],
            # Row 1: Inverse & Powers
            [("asin", "fn", "asin"), ("acos", "fn", "acos"), ("atan", "fn", "atan"), ("^", "char", "^"), ("sqrt", "fn", "sqrt")],
            # Row 2: Constants & Grouping
            [("π", "const", "pi"), ("e", "const", "e"), ("(", "char", "("), (")", "char", ")"), ("fact", "fn", "fact")],
            # Row 3: Control & Divide
            [("C", "clear", None), ("DEL", "backspace", None), ("%", "char", "%"), ("/", "char", "/"), ("cbrt", "fn", "cbrt")],
            # Row 4: 7 8 9 *
            [("7", "char", "7"), ("8", "char", "8"), ("9", "char", "9"), ("*", "char", "*"), ("abs", "fn", "abs")],
            # Row 5: 4 5 6 -
            [("4", "char", "4"), ("5", "char", "5"), ("6", "char", "6"), ("-", "char", "-"), ("1/x", "special", "inv")],
            # Row 6: 1 2 3 + =
            [("1", "char", "1"), ("2", "char", "2"), ("3", "char", "3"), ("+", "char", "+"), ("=", "eval", None)],
            # Row 7: 0 . +/-
            [("0", "char", "0"), (".", "char", "."), ("+/-", "sign", None)]
        ]

        # Colors
        fn_color = ("gray75", "#2A2D32")
        num_color = ("gray90", "#3A3D40")
        accent_color = ("#1f6aa5", "#1f6aa5")
        clear_color = ("#d9534f", "#a93226")
        del_color = ("#e67e22", "#ba4a00")
        equal_color = ("#27ae60", "#229954")

        row_idx = 0
        for row in btn_layout[:-1]:  # Rows 0 to 6
            col_idx = 0
            for item in row:
                label, action, arg = item[0], item[1], item[2]
                fg = fn_color
                if label in "0123456789.":
                    fg = num_color
                elif label in "+-*/^%":
                    fg = accent_color
                elif label == "C":
                    fg = clear_color
                elif label == "DEL":
                    fg = del_color
                elif label == "=":
                    fg = equal_color

                cmd = self._make_command(action, arg)
                btn = ctk.CTkButton(
                    keypad_frame,
                    text=label,
                    font=ctk.CTkFont(size=14, weight="bold" if label in "0123456789=C" else "normal"),
                    fg_color=fg,
                    command=cmd,
                    height=44,
                    corner_radius=8
                )
                btn.grid(row=row_idx, column=col_idx, padx=3, pady=3, sticky="nsew")
                col_idx += 1
            row_idx += 1

        # Last row (0, ., +/-)
        last_row = btn_layout[-1]
        btn_0 = ctk.CTkButton(
            keypad_frame,
            text="0",
            font=ctk.CTkFont(size=14, weight="bold"),
            fg_color=num_color,
            command=lambda: self.presenter.append_char("0"),
            height=44,
            corner_radius=8
        )
        btn_0.grid(row=7, column=0, columnspan=2, padx=3, pady=3, sticky="nsew")

        btn_dot = ctk.CTkButton(
            keypad_frame,
            text=".",
            font=ctk.CTkFont(size=14, weight="bold"),
            fg_color=num_color,
            command=lambda: self.presenter.append_char("."),
            height=44,
            corner_radius=8
        )
        btn_dot.grid(row=7, column=2, padx=3, pady=3, sticky="nsew")

        btn_sign = ctk.CTkButton(
            keypad_frame,
            text="+/-",
            font=ctk.CTkFont(size=14, weight="bold"),
            fg_color=fn_color,
            command=self.presenter.toggle_sign,
            height=44,
            corner_radius=8
        )
        btn_sign.grid(row=7, column=3, columnspan=2, padx=3, pady=3, sticky="nsew")

    def _make_command(self, action: str, arg: Optional[str]):
        if action == "char":
            return lambda: self.presenter.append_char(arg)
        elif action == "fn":
            return lambda: self.presenter.append_function(arg)
        elif action == "const":
            return lambda: self.presenter.append_constant(arg)
        elif action == "clear":
            return self.presenter.clear
        elif action == "backspace":
            return self.presenter.backspace
        elif action == "eval":
            return self.presenter.evaluate
        elif action == "special" and arg == "inv":
            return lambda: self.presenter.append_function("1/")
        return lambda: None

    def _toggle_angle_mode(self):
        new_mode = self.presenter.toggle_angle_mode()
        self.mode_btn.configure(text=new_mode.upper())

    def _toggle_theme(self):
        if self.theme_switch.get() == "dark":
            ctk.set_appearance_mode("dark")
            self.theme_switch.configure(text="Oscuro")
        else:
            ctk.set_appearance_mode("light")
            self.theme_switch.configure(text="Claro")

    def _update_display(self):
        text = self.presenter.get_display_text()
        hist = self.presenter.get_history_preview()
        self.main_display.configure(text=text)
        self.history_label.configure(text=hist)

    def _bind_keyboard(self):
        self.bind("<Return>", lambda e: self.presenter.evaluate())
        self.bind("<KP_Enter>", lambda e: self.presenter.evaluate())
        self.bind("<BackSpace>", lambda e: self.presenter.backspace())
        self.bind("<Escape>", lambda e: self.presenter.clear())

        for char in "0123456789+-*/.^()%":
            self.bind(char, lambda e, c=char: self.presenter.append_char(c))
