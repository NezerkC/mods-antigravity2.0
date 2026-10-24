"""Evaluates an RPN token list using a stack-based machine."""
import math
from typing import List, Union
from .tokens import Token, TokenType
from .exceptions import EvaluationError, DivisionByZeroError, DomainMathError

class Evaluator:
    """Evaluates Reverse Polish Notation (RPN) mathematical expressions."""

    def __init__(self, angle_mode: str = "deg"):
        """
        :param angle_mode: 'deg' for degrees, 'rad' for radians.
        """
        self.angle_mode = angle_mode.lower()

    def evaluate(self, rpn_tokens: List[Token]) -> Union[int, float]:
        if not rpn_tokens:
            raise EvaluationError("Nothing to evaluate")

        stack: List[float] = []

        for token in rpn_tokens:
            if token.type in (TokenType.NUMBER, TokenType.CONSTANT):
                stack.append(token.value)

            elif token.type == TokenType.UNARY_MINUS:
                if not stack:
                    raise EvaluationError("Missing operand for unary minus")
                val = stack.pop()
                stack.append(-val)

            elif token.type in (
                TokenType.PLUS,
                TokenType.MINUS,
                TokenType.MULTIPLY,
                TokenType.DIVIDE,
                TokenType.POWER,
                TokenType.MODULO,
            ):
                if len(stack) < 2:
                    raise EvaluationError(f"Missing operand for operator '{token.value}'")
                b = stack.pop()
                a = stack.pop()
                res = self._apply_binary_op(token.type, a, b)
                stack.append(res)

            elif token.type == TokenType.FUNCTION:
                if not stack:
                    raise EvaluationError(f"Missing argument for function '{token.value}'")
                arg = stack.pop()
                res = self._apply_function(token.value, arg)
                stack.append(res)

            else:
                raise EvaluationError(f"Unsupported token in evaluation: {token}")

        if len(stack) != 1:
            raise EvaluationError("Malformed expression: multiple values left on stack")

        final_val = stack[0]
        # Clean up floating point near-zero artifacts (e.g. sin(180 deg) = 1.22e-16 -> 0.0)
        if isinstance(final_val, float):
            if abs(final_val) < 1e-12:
                final_val = 0.0
            elif abs(final_val - round(final_val)) < 1e-12:
                final_val = round(final_val)
            else:
                final_val = round(final_val, 10)

        # Convert to int if exact integer
        if isinstance(final_val, float) and final_val.is_integer():
            return int(final_val)

        return final_val

    def _apply_binary_op(self, op: TokenType, a: float, b: float) -> float:
        if op == TokenType.PLUS:
            return a + b
        elif op == TokenType.MINUS:
            return a - b
        elif op == TokenType.MULTIPLY:
            return a * b
        elif op == TokenType.DIVIDE:
            if b == 0:
                raise DivisionByZeroError("Cannot divide by zero")
            return a / b
        elif op == TokenType.MODULO:
            if b == 0:
                raise DivisionByZeroError("Cannot modulo by zero")
            return a % b
        elif op == TokenType.POWER:
            try:
                res = a ** b
                if isinstance(res, complex):
                    raise DomainMathError("Complex result unsupported in real mode")
                return res
            except OverflowError:
                raise EvaluationError("Math Error: Numerical overflow")
            except ValueError:
                raise DomainMathError("Math Error: Invalid exponentiation domain")
        raise EvaluationError(f"Unknown binary operator {op}")

    def _apply_function(self, func_name: str, x: float) -> float:
        fn = func_name.lower()

        # Trigonometry with Angle Mode support
        if fn == "sin":
            rad = math.radians(x) if self.angle_mode == "deg" else x
            return math.sin(rad)
        elif fn == "cos":
            rad = math.radians(x) if self.angle_mode == "deg" else x
            return math.cos(rad)
        elif fn == "tan":
            if self.angle_mode == "deg":
                # Check for undefined angles (90, 270, etc.)
                normalized = abs(x) % 180
                if abs(normalized - 90) < 1e-9:
                    raise DomainMathError(f"Tangent undefined at {x}°")
                rad = math.radians(x)
            else:
                rad = x
            return math.tan(rad)

        # Inverse Trigonometry
        elif fn == "asin":
            if x < -1.0 or x > 1.0:
                raise DomainMathError("asin domain is [-1, 1]")
            res = math.asin(x)
            return math.degrees(res) if self.angle_mode == "deg" else res
        elif fn == "acos":
            if x < -1.0 or x > 1.0:
                raise DomainMathError("acos domain is [-1, 1]")
            res = math.acos(x)
            return math.degrees(res) if self.angle_mode == "deg" else res
        elif fn == "atan":
            res = math.atan(x)
            return math.degrees(res) if self.angle_mode == "deg" else res

        # Hyperbolic
        elif fn == "sinh":
            return math.sinh(x)
        elif fn == "cosh":
            return math.cosh(x)
        elif fn == "tanh":
            return math.tanh(x)

        # Logarithms & Exponential
        elif fn in ("log", "log10"):
            if x <= 0:
                raise DomainMathError("log10 requires positive argument")
            return math.log10(x)
        elif fn == "ln":
            if x <= 0:
                raise DomainMathError("ln requires positive argument")
            return math.log(x)
        elif fn == "log2":
            if x <= 0:
                raise DomainMathError("log2 requires positive argument")
            return math.log2(x)
        elif fn == "exp":
            try:
                return math.exp(x)
            except OverflowError:
                raise EvaluationError("Numerical overflow in exp()")

        # Roots & Powers
        elif fn == "sqrt":
            if x < 0:
                raise DomainMathError("sqrt of negative number")
            return math.sqrt(x)
        elif fn == "cbrt":
            return math.copysign(abs(x) ** (1 / 3), x)
        elif fn == "abs":
            return abs(x)
        elif fn in ("fact", "factorial"):
            if x < 0 or not float(x).is_integer():
                raise DomainMathError("Factorial requires non-negative integer")
            if x > 170:
                raise EvaluationError("Factorial overflow (> 170)")
            return math.factorial(int(x))

        raise EvaluationError(f"Unsupported function: {func_name}")
