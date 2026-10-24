"""Lexer (Tokenizer) for mathematical expressions."""
import math
import re
from typing import List
from .tokens import Token, TokenType
from .exceptions import LexerError

class Lexer:
    """Tokenizes a mathematical expression string into typed tokens."""

    CONSTANTS = {
        "pi": math.pi,
        "e": math.e,
        "tau": math.tau,
        "phi": (1 + math.sqrt(5)) / 2,
    }

    FUNCTIONS = {
        "sin", "cos", "tan",
        "asin", "acos", "atan",
        "sinh", "cosh", "tanh",
        "log", "ln", "log10", "log2",
        "sqrt", "cbrt", "abs", "exp", "fact", "factorial"
    }

    # Matches numbers including decimals and scientific notation (e.g. 1.25e-3)
    NUMBER_REGEX = re.compile(r"^\d+(\.\d+)?([eE][+-]?\d+)?")
    IDENTIFIER_REGEX = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*")

    def __init__(self, text: str):
        self.text = text
        self.pos = 0
        self.length = len(text)

    def tokenize(self) -> List[Token]:
        tokens: List[Token] = []

        while self.pos < self.length:
            char = self.text[self.pos]

            if char.isspace():
                self.pos += 1
                continue

            # Numbers
            if char.isdigit() or (char == '.' and self._peek_is_digit()):
                num_token = self._read_number()
                tokens.append(num_token)
                continue

            # Operators and punctuation
            if char == '+':
                tokens.append(Token(TokenType.PLUS, '+', self.pos))
                self.pos += 1
            elif char == '-':
                # Distinguish between binary minus and unary minus
                if self._is_unary_context(tokens):
                    tokens.append(Token(TokenType.UNARY_MINUS, 'neg', self.pos))
                else:
                    tokens.append(Token(TokenType.MINUS, '-', self.pos))
                self.pos += 1
            elif char == '*':
                if self._match_next('*'):
                    tokens.append(Token(TokenType.POWER, '^', self.pos - 1))
                else:
                    tokens.append(Token(TokenType.MULTIPLY, '*', self.pos))
                    self.pos += 1
            elif char == '/':
                tokens.append(Token(TokenType.DIVIDE, '/', self.pos))
                self.pos += 1
            elif char == '^':
                tokens.append(Token(TokenType.POWER, '^', self.pos))
                self.pos += 1
            elif char == '%':
                tokens.append(Token(TokenType.MODULO, '%', self.pos))
                self.pos += 1
            elif char == '(':
                tokens.append(Token(TokenType.LPAREN, '(', self.pos))
                self.pos += 1
            elif char == ')':
                tokens.append(Token(TokenType.RPAREN, ')', self.pos))
                self.pos += 1
            elif char == ',':
                tokens.append(Token(TokenType.COMMA, ',', self.pos))
                self.pos += 1
            elif char.isalpha():
                id_token = self._read_identifier()
                tokens.append(id_token)
            else:
                raise LexerError(f"Unexpected character: {char!r}", self.pos)

        tokens.append(Token(TokenType.EOF, None, self.pos))
        return tokens

    def _peek_is_digit(self) -> bool:
        if self.pos + 1 < self.length:
            return self.text[self.pos + 1].isdigit()
        return False

    def _match_next(self, expected: str) -> bool:
        if self.pos + 1 < self.length and self.text[self.pos + 1] == expected:
            self.pos += 2
            return True
        return False

    def _read_number(self) -> Token:
        start_pos = self.pos
        match = self.NUMBER_REGEX.match(self.text[self.pos:])
        if not match:
            raise LexerError("Invalid number format", self.pos)
        num_str = match.group(0)
        self.pos += len(num_str)
        val = float(num_str) if ('.' in num_str or 'e' in num_str.lower()) else int(num_str)
        return Token(TokenType.NUMBER, val, start_pos)

    def _read_identifier(self) -> Token:
        start_pos = self.pos
        match = self.IDENTIFIER_REGEX.match(self.text[self.pos:])
        if not match:
            raise LexerError("Invalid identifier", self.pos)
        ident = match.group(0).lower()
        self.pos += len(ident)

        if ident in self.CONSTANTS:
            return Token(TokenType.CONSTANT, self.CONSTANTS[ident], start_pos)
        if ident in self.FUNCTIONS:
            return Token(TokenType.FUNCTION, ident, start_pos)

        raise LexerError(f"Unknown function or constant: '{ident}'", start_pos)

    def _is_unary_context(self, tokens: List[Token]) -> bool:
        if not tokens:
            return True
        last = tokens[-1]
        return last.type in (
            TokenType.PLUS,
            TokenType.MINUS,
            TokenType.MULTIPLY,
            TokenType.DIVIDE,
            TokenType.POWER,
            TokenType.MODULO,
            TokenType.UNARY_MINUS,
            TokenType.LPAREN,
            TokenType.COMMA,
        )
