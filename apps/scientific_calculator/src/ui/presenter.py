"""Presenter for the scientific calculator UI (Model-View-Presenter pattern)."""
from typing import List, Callable, Optional
from ..ports.engine_port import CalculatorEnginePort
from ..domain.exceptions import CalculatorError, DivisionByZeroError, DomainMathError

class CalculatorPresenter:
    """Manages the UI presentation state and delegates to CalculatorEnginePort."""

    def __init__(self, engine: CalculatorEnginePort, on_state_changed: Optional[Callable[[], None]] = None):
        self.engine = engine
        self.on_state_changed = on_state_changed

        self.expression: str = ""
        self.history_preview: str = ""
        self.history: List[str] = []
        self.angle_mode: str = "deg"  # "deg" or "rad"
        self.is_result_shown: bool = False
        self.error_state: Optional[str] = None

    def _notify(self) -> None:
        if self.on_state_changed:
            self.on_state_changed()

    def get_display_text(self) -> str:
        if self.error_state:
            return self.error_state
        return self.expression if self.expression else "0"

    def get_history_preview(self) -> str:
        return self.history_preview

    def append_char(self, char: str) -> None:
        if self.error_state or self.is_result_shown:
            # If a result is shown and user types an operator, continue with result
            if self.is_result_shown and char in "+-*/^%":
                self.history_preview = f"Ans = {self.expression}"
                self.error_state = None
                self.is_result_shown = False
            else:
                self.expression = ""
                self.error_state = None
                self.is_result_shown = False

        self.expression += char
        self._notify()

    def append_function(self, func_name: str) -> None:
        if self.error_state or self.is_result_shown:
            self.expression = ""
            self.error_state = None
            self.is_result_shown = False

        self.expression += f"{func_name}("
        self._notify()

    def append_constant(self, const_name: str) -> None:
        if self.error_state or self.is_result_shown:
            self.expression = ""
            self.error_state = None
            self.is_result_shown = False

        self.expression += const_name
        self._notify()

    def clear(self) -> None:
        self.expression = ""
        self.history_preview = ""
        self.error_state = None
        self.is_result_shown = False
        self._notify()

    def backspace(self) -> None:
        if self.error_state or self.is_result_shown:
            self.clear()
            return

        if self.expression:
            self.expression = self.expression[:-1]
            self._notify()

    def toggle_sign(self) -> None:
        if self.error_state:
            return
        if not self.expression:
            self.expression = "-"
        elif self.expression.startswith("-"):
            self.expression = self.expression[1:]
        else:
            self.expression = f"-({self.expression})"
        self._notify()

    def toggle_angle_mode(self) -> str:
        self.angle_mode = "rad" if self.angle_mode == "deg" else "deg"
        self._notify()
        return self.angle_mode

    def evaluate(self) -> None:
        if not self.expression:
            return

        expr = self.expression
        try:
            result = self.engine.evaluate(expr, angle_mode=self.angle_mode)
            self.history_preview = f"{expr} ="
            self.expression = str(result)
            self.history.append(f"{expr} = {result}")
            self.is_result_shown = True
            self.error_state = None
        except DivisionByZeroError:
            self.error_state = "Cannot divide by 0"
        except DomainMathError as e:
            self.error_state = "Domain Error"
        except CalculatorError:
            self.error_state = "Syntax Error"
        except Exception:
            self.error_state = "Error"
        finally:
            self._notify()
