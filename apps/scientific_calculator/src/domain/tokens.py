"""Token definitions for the mathematical lexer and parser."""
from dataclasses import dataclass
from enum import Enum, auto

class TokenType(Enum):
    NUMBER = auto()
    PLUS = auto()
    MINUS = auto()
    MULTIPLY = auto()
    DIVIDE = auto()
    POWER = auto()
    MODULO = auto()
    LPAREN = auto()
    RPAREN = auto()
    COMMA = auto()
    FUNCTION = auto()
    CONSTANT = auto()
    UNARY_MINUS = auto()
    EOF = auto()

@dataclass(frozen=True)
class Token:
    type: TokenType
    value: any
    position: int

    def __repr__(self) -> str:
        return f"Token({self.type.name}, {self.value!r}, pos={self.position})"
