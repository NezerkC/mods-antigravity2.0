"""Unit tests for the mathematical Parser (Shunting-Yard) using standard unittest."""
import unittest
from apps.scientific_calculator.src.domain.lexer import Lexer
from apps.scientific_calculator.src.domain.parser import Parser
from apps.scientific_calculator.src.domain.tokens import TokenType
from apps.scientific_calculator.src.domain.exceptions import ParserError

class TestParser(unittest.TestCase):
    def test_parser_operator_precedence(self):
        tokens = Lexer("2 + 3 * 4").tokenize()
        parser = Parser(tokens)
        rpn = parser.parse()
        types = [t.type for t in rpn]
        self.assertEqual(types, [
            TokenType.NUMBER,
            TokenType.NUMBER,
            TokenType.NUMBER,
            TokenType.MULTIPLY,
            TokenType.PLUS,
        ])

    def test_parser_parentheses_override(self):
        tokens = Lexer("(2 + 3) * 4").tokenize()
        parser = Parser(tokens)
        rpn = parser.parse()
        types = [t.type for t in rpn]
        self.assertEqual(types, [
            TokenType.NUMBER,
            TokenType.NUMBER,
            TokenType.PLUS,
            TokenType.NUMBER,
            TokenType.MULTIPLY,
        ])

    def test_parser_function_call(self):
        tokens = Lexer("sin(45)").tokenize()
        parser = Parser(tokens)
        rpn = parser.parse()
        self.assertEqual(rpn[0].value, 45)
        self.assertEqual(rpn[1].type, TokenType.FUNCTION)
        self.assertEqual(rpn[1].value, "sin")

    def test_parser_mismatched_parentheses(self):
        tokens = Lexer("(2 + 3 * 4").tokenize()
        with self.assertRaises(ParserError):
            Parser(tokens).parse()

        tokens2 = Lexer("2 + 3) * 4").tokenize()
        with self.assertRaises(ParserError):
            Parser(tokens2).parse()

if __name__ == "__main__":
    unittest.main()
