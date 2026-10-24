"""Domain exceptions for the scientific calculator engine."""

class CalculatorError(Exception):
    """Base exception for all calculator errors."""
    pass

class LexerError(CalculatorError):
    """Raised when an invalid character or malformed token is encountered."""
    def __init__(self, message: str, position: int):
        super().__init__(f"Lexer error at position {position}: {message}")
        self.position = position

class ParserError(CalculatorError):
    """Raised when the mathematical syntax is invalid."""
    def __init__(self, message: str, token=None):
        super().__init__(message)
        self.token = token

class EvaluationError(CalculatorError):
    """Raised during mathematical evaluation."""
    pass

class DivisionByZeroError(EvaluationError):
    """Raised when dividing or modulo by zero."""
    def __init__(self, message: str = "Math Error: Division by zero"):
        super().__init__(message)

class DomainMathError(EvaluationError):
    """Raised when an operation is outside of real mathematical domain."""
    def __init__(self, message: str = "Math Error: Out of domain"):
        super().__init__(message)
