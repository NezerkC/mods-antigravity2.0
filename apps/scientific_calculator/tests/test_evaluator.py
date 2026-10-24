"""Unit tests for the mathematical Evaluator and Domain Engine using standard unittest."""
import unittest
from apps.scientific_calculator.src.domain.engine import CalculatorEngine
from apps.scientific_calculator.src.domain.exceptions import DivisionByZeroError, DomainMathError

class TestEvaluatorAndEngine(unittest.TestCase):
    def setUp(self):
        self.engine = CalculatorEngine()

    def test_evaluator_basic_arithmetic(self):
        self.assertEqual(self.engine.evaluate("1 + 2 * 3"), 7)
        self.assertEqual(self.engine.evaluate("(1 + 2) * 3"), 9)
        self.assertEqual(self.engine.evaluate("10 / 4"), 2.5)
        self.assertEqual(self.engine.evaluate("2 ^ 3"), 8)
        self.assertEqual(self.engine.evaluate("10 % 3"), 1)

    def test_evaluator_unary_minus(self):
        self.assertEqual(self.engine.evaluate("-5 + 10"), 5)
        self.assertEqual(self.engine.evaluate("-(2 + 3) * 4"), -20)
        self.assertEqual(self.engine.evaluate("5 - -3"), 8)

    def test_evaluator_trigonometry_degrees(self):
        self.assertEqual(self.engine.evaluate("sin(90)", angle_mode="deg"), 1)
        self.assertEqual(self.engine.evaluate("cos(0)", angle_mode="deg"), 1)
        self.assertEqual(self.engine.evaluate("sin(0)", angle_mode="deg"), 0)
        self.assertEqual(self.engine.evaluate("tan(45)", angle_mode="deg"), 1)

    def test_evaluator_trigonometry_radians(self):
        self.assertEqual(self.engine.evaluate("sin(pi / 2)", angle_mode="rad"), 1)
        self.assertEqual(self.engine.evaluate("cos(pi)", angle_mode="rad"), -1)

    def test_evaluator_special_functions(self):
        self.assertEqual(self.engine.evaluate("sqrt(16)"), 4)
        self.assertEqual(self.engine.evaluate("cbrt(27)"), 3)
        self.assertEqual(self.engine.evaluate("abs(-42)"), 42)
        self.assertEqual(self.engine.evaluate("log10(1000)"), 3)
        self.assertEqual(self.engine.evaluate("fact(5)"), 120)

    def test_evaluator_division_by_zero(self):
        with self.assertRaises(DivisionByZeroError):
            self.engine.evaluate("42 / 0")
        with self.assertRaises(DivisionByZeroError):
            self.engine.evaluate("10 % 0")

    def test_evaluator_math_domain_errors(self):
        with self.assertRaises(DomainMathError):
            self.engine.evaluate("sqrt(-4)")
        with self.assertRaises(DomainMathError):
            self.engine.evaluate("log10(-10)")
        with self.assertRaises(DomainMathError):
            self.engine.evaluate("tan(90)", angle_mode="deg")

if __name__ == "__main__":
    unittest.main()
