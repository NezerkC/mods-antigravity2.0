"""Unit tests for the mathematical Lexer using standard unittest."""
import math
import unittest
from apps.scientific_calculator.src.domain.lexer import Lexer
from apps.scientific_calculator.src.domain.tokens import TokenType
from apps.scientific_calculator.src.domain.exceptions import LexerError

class TestLexer(unittest.TestCase):
    def test_lexer_numbers_and_operators(self):
        lexer = Lexer("3.14 + 42 * 10 / 2")
        tokens = lexer.tokenize()
        types = [t.type for t in tokens]
        self.assertEqual(types, [
            TokenType.NUMBER,
            TokenType.PLUS,
            TokenType.NUMBER,
            TokenType.MULTIPLY,
            TokenType.NUMBER,
            TokenType.DIVIDE,
            TokenType.NUMBER,
            TokenType.EOF,
        ])
        self.assertEqual(tokens[0].value, 3.14)
        self.assertEqual(tokens[2].value, 42)

    def test_lexer_scientific_notation(self):
        lexer = Lexer("1.5e3 + 2E-2")
        tokens = lexer.tokenize()
        self.assertEqual(tokens[0].value, 1500.0)
        self.assertEqual(tokens[2].value, 0.02)

    def test_lexer_unary_minus(self):
        lexer = Lexer("-5 + (-3 * 2)")
        tokens = lexer.tokenize()
        types = [t.type for t in tokens]
        self.assertEqual(types, [
            TokenType.UNARY_MINUS,
            TokenType.NUMBER,
            TokenType.PLUS,
            TokenType.LPAREN,
            TokenType.UNARY_MINUS,
            TokenType.NUMBER,
            TokenType.MULTIPLY,
            TokenType.NUMBER,
            TokenType.RPAREN,
            TokenType.EOF,
        ])

    def test_lexer_functions_and_constants(self):
        lexer = Lexer("sin(pi / 2) + log10(100)")
        tokens = lexer.tokenize()
        self.assertEqual(tokens[0].type, TokenType.FUNCTION)
        self.assertEqual(tokens[0].value, "sin")
        self.assertEqual(tokens[2].type, TokenType.CONSTANT)
        self.assertEqual(tokens[2].value, math.pi)
        self.assertEqual(tokens[6].type, TokenType.PLUS)
        self.assertEqual(tokens[7].type, TokenType.FUNCTION)
        self.assertEqual(tokens[7].value, "log10")

    def test_lexer_invalid_character(self):
        lexer = Lexer("5 & 3")
        with self.assertRaises(LexerError):
            lexer.tokenize()

if __name__ == "__main__":
    unittest.main()
