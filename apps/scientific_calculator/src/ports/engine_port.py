"""Driving port definition for the calculator engine."""
from typing import Protocol, Union

class CalculatorEnginePort(Protocol):
    """Contract for calculating mathematical expressions."""

    def evaluate(self, expression: str, angle_mode: str = "deg") -> Union[int, float]:
        """Evaluates a mathematical string and returns a numerical result.
        
        :param expression: Infix mathematical expression (e.g. 'sin(30) + 5 * 2')
        :param angle_mode: 'deg' for degrees or 'rad' for radians
        :raises CalculatorError: on syntax, domain, or evaluation error
        :return: evaluated result as int or float
        """
        ...
