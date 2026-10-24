"""Unit tests for CalculatorPresenter."""
import unittest
from apps.scientific_calculator.src.domain.engine import CalculatorEngine
from apps.scientific_calculator.src.ui.presenter import CalculatorPresenter

class TestCalculatorPresenter(unittest.TestCase):
    def setUp(self):
        self.engine = CalculatorEngine()
        self.notified = False

        def on_change():
            self.notified = True

        self.presenter = CalculatorPresenter(self.engine, on_state_changed=on_change)

    def test_presenter_typing_and_evaluation(self):
        self.presenter.append_char("2")
        self.presenter.append_char("+")
        self.presenter.append_char("3")
        self.assertEqual(self.presenter.get_display_text(), "2+3")
        self.assertTrue(self.notified)

        self.presenter.evaluate()
        self.assertEqual(self.presenter.get_display_text(), "5")
        self.assertEqual(self.presenter.get_history_preview(), "2+3 =")

    def test_presenter_division_by_zero(self):
        self.presenter.append_char("1")
        self.presenter.append_char("/")
        self.presenter.append_char("0")
        self.presenter.evaluate()
        self.assertEqual(self.presenter.get_display_text(), "Cannot divide by 0")

    def test_presenter_functions(self):
        self.presenter.append_function("sin")
        self.presenter.append_char("90")
        self.presenter.append_char(")")
        self.presenter.evaluate()
        self.assertEqual(self.presenter.get_display_text(), "1")

    def test_presenter_angle_mode_toggle(self):
        self.assertEqual(self.presenter.angle_mode, "deg")
        mode = self.presenter.toggle_angle_mode()
        self.assertEqual(mode, "rad")
        self.assertEqual(self.presenter.angle_mode, "rad")

    def test_presenter_clear_and_backspace(self):
        self.presenter.append_char("1")
        self.presenter.append_char("2")
        self.presenter.append_char("3")
        self.presenter.backspace()
        self.assertEqual(self.presenter.get_display_text(), "12")
        self.presenter.clear()
        self.assertEqual(self.presenter.get_display_text(), "0")

if __name__ == "__main__":
    unittest.main()
