"""Core Calculator Engine implementing the CalculatorEnginePort."""
from typing import Union
from ..ports.engine_port import CalculatorEnginePort
from .lexer import Lexer
from .parser import Parser
from .evaluator import Evaluator

class CalculatorEngine(CalculatorEnginePort):
    """Facade orchestrating the Lexer, Parser, and Evaluator."""

    def evaluate(self, expression: str, angle_mode: str = "deg") -> Union[int, float]:
        lexer = Lexer(expression)
        tokens = lexer.tokenize()

        parser = Parser(tokens)
        rpn = parser.parse()

        evaluator = Evaluator(angle_mode=angle_mode)
        return evaluator.evaluate(rpn)
