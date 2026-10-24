"""Parser using Dijkstra's Shunting-Yard algorithm to generate Reverse Polish Notation (RPN)."""
from typing import List
from .tokens import Token, TokenType
from .exceptions import ParserError

class Parser:
    """Parses a list of tokens into Reverse Polish Notation (RPN)."""

    # Precedence table: higher number means higher precedence
    PRECEDENCE = {
        TokenType.PLUS: 1,
        TokenType.MINUS: 1,
        TokenType.MULTIPLY: 2,
        TokenType.DIVIDE: 2,
        TokenType.MODULO: 2,
        TokenType.POWER: 3,
        TokenType.UNARY_MINUS: 4,
        TokenType.FUNCTION: 5,
    }

    # True if right-associative
    RIGHT_ASSOCIATIVE = {
        TokenType.POWER,
        TokenType.UNARY_MINUS,
        TokenType.FUNCTION,
    }

    def __init__(self, tokens: List[Token]):
        self.tokens = [t for t in tokens if t.type != TokenType.EOF]

    def parse(self) -> List[Token]:
        """Converts infix tokens to postfix (RPN) token list."""
        if not self.tokens:
            raise ParserError("Empty expression")

        output_queue: List[Token] = []
        operator_stack: List[Token] = []

        for token in self.tokens:
            if token.type in (TokenType.NUMBER, TokenType.CONSTANT):
                output_queue.append(token)

            elif token.type == TokenType.FUNCTION:
                operator_stack.append(token)

            elif token.type == TokenType.COMMA:
                while operator_stack and operator_stack[-1].type != TokenType.LPAREN:
                    output_queue.append(operator_stack.pop())
                if not operator_stack:
                    raise ParserError("Misplaced comma or mismatched parentheses", token)

            elif token.type in self.PRECEDENCE:
                curr_prec = self.PRECEDENCE[token.type]
                is_right_assoc = token.type in self.RIGHT_ASSOCIATIVE

                while (operator_stack and
                       operator_stack[-1].type != TokenType.LPAREN and
                       operator_stack[-1].type in self.PRECEDENCE):
                    top_prec = self.PRECEDENCE[operator_stack[-1].type]
                    if (not is_right_assoc and curr_prec <= top_prec) or \
                       (is_right_assoc and curr_prec < top_prec):
                        output_queue.append(operator_stack.pop())
                    else:
                        break
                operator_stack.append(token)

            elif token.type == TokenType.LPAREN:
                operator_stack.append(token)

            elif token.type == TokenType.RPAREN:
                while operator_stack and operator_stack[-1].type != TokenType.LPAREN:
                    output_queue.append(operator_stack.pop())
                
                if not operator_stack:
                    raise ParserError("Mismatched parentheses: missing '('", token)
                operator_stack.pop() # Pop LPAREN

                # If the token at the top of the stack is a function, pop it to the output queue
                if operator_stack and operator_stack[-1].type == TokenType.FUNCTION:
                    output_queue.append(operator_stack.pop())

            else:
                raise ParserError(f"Unexpected token: {token}", token)

        while operator_stack:
            top = operator_stack.pop()
            if top.type in (TokenType.LPAREN, TokenType.RPAREN):
                raise ParserError("Mismatched parentheses: unclosed '('", top)
            output_queue.append(top)

        return output_queue
