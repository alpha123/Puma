(function (window, undefined) {

function Puma(selector, context) {
    context = context || document;
    var tree = Puma.Parser.parse(selector);
    if (Puma.Compiler && context.getElementById && Puma.Compiler.canCompile(tree))
        return Puma.Compiler.compile(tree)(context);
    return tree.evaluate(context);
}

function arrayIndexOf(array, elem) {
    if (array.indexOf)
        return array.indexOf(elem);
    for (var i = 0, l = array.length; i < l; ++i) {
        if (array[i] === elem)
            return i;
    }
    return -1;
}

function arrayFilter(array, func) {
    if (array.filter)
        return array.filter(func);
    for (var newArray = [], i = 0, l = array.length; i < l; ++i) {
        if (func(array[i], i))
            newArray.push(array[i]);
    }
    return newArray;
}

Puma.i = Puma.arrayIndexOf = arrayIndexOf;
Puma.f = Puma.arrayFilter = arrayFilter;

Puma.AST = {
    Tag: function (value) {
        this.value = value;
        this.evaluate = function (context) {
            var result = context.getElementsByTagName(value);
            if (result instanceof Object)
                return [].slice.call(result);
            return arrayFilter(result, function () { return true; });
        };
    },
    
    BinOp: function (value, left, right) {
        this.value = value;
        this.left = left;
        this.right = right;
        this.evaluate = function (context) {
            return Puma.operators.binary[value](this.left, this.right, context);
        };
    },
    
    UnOp: function (value, right) {
        this.value = value;
        this.right = right;
        this.evaluate = function (context) {
            return Puma.operators.unary[value](this.right, context);
        };
    }
};

var old = window.Puma, POB, POU, i, ident = 'ident', op = 'op';

Puma.Scanner = {
    tokenize: function (selector) {
        var current = selector.charAt(0), i = 0, from = 0, prev, next, quote,
        acc, tested, single = '()[]', tokens = [];
    
        function makeToken(type, value) {
            return {
                type: type,
                value: value,
                from: from,
                to: i,
                error: function (message) {
                    throw new Error(message);
                }
            };
        }
        
        function test(c) {
            return c && (
              (c > '/' && c < ':') || // 0-9
              (c > '@' && c < '[') || // A-Z
              (c > '`' && c < '{') || // a-z
              c == '-' || c == '_'
            );
        }
        
        while (current) {
            if (current == '"' || current == "'" || current == '`') {
                acc = '';
                quote = current;
                while (true) {
                    current = selector.charAt(++i);
                    if (current == quote)
                        break;
                    else if (!current)
                        makeToken(ident, acc).error('Unterminated string');
                    acc += current;
                }
                tokens.push(makeToken(quote == '`' ? op : ident, acc));
            }
            else if (current == ' ') {
                prev = selector.charAt(i - 1);
                next = selector.charAt(i + 1);
                if ((test(prev) || prev == '"' || prev == "'") && (
                    (test(next) || next == '"' || next == "'") || selector.charAt(i + 2) != ' '))
                    tokens.push(makeToken(op, current));
            }
            else if (current == '*') {
                if ((next = selector.charAt(++i)) == '=')
                    tokens.push(makeToken(op, current + next));
                else
                    tokens.push(makeToken(ident, current));
            }
            else if (single.indexOf(current) > -1)
                tokens.push(makeToken(op, current));
            else {
                acc = '';
                tested = test(current);
                while (current && current != ' ' && ((tested && test(current)) ||
                (!tested && !test(current)))) {
                    acc += current;
                    current = selector.charAt(++i);
                }
                --i;
                tokens.push(makeToken(tested ? ident : op, acc));
            }
            current = selector.charAt(++i);
        }
        return tokens;
    }
};

// A top-down operator precendence parser for CSS selectors.
// Technique and code inspired by Douglas Crockford's article
// "Top Down Operator Precendence"
// http://javascript.crockford.com/tdop/tdop.html

Puma.Parser = {
    cache: [],
    cacheSize: 50,
    parse: function (selector) {
        if (this.cache[selector])
            return this.cache[selector];
        var symbols = {}, token, tokens = Puma.Scanner.tokenize(selector),
        tokenNum = 0, result, POB = Puma.operators.binary, POU = Puma.operators.unary, i;
        
        function advance(id) {
            if (id && token.id != id)
                token.error('Expected ' + id + ', not ' + token.id);
            if (tokenNum >= tokens.length) {
                token = symbols['(end)'];
                return;
            }
            var tok = tokens[tokenNum++], val = tok.value, type = tok.type,
            prevTok = tokens[tokenNum - 2], node, i;
            if (type == ident) {
                node = new Puma.AST.Tag(val);
                node.nud = function () {
                    return this;
                };
                node.lbp = 0;
            }
            else if (type == op) {
                if (!symbols[val])
                    tok.error('Unknown operator ' + val);
                if (POU[val] && (!prevTok || (prevTok.type == op &&
                prevTok.value != ']' && prevTok.value != ')')))
                    node = new Puma.AST.UnOp(val, tok.right);
                else
                    node = new Puma.AST.BinOp(val, tok.right, tok.left);
                for (i in symbols[val])
                    node[i] = symbols[val][i];
            }
            else
                tok.error('Unexpected token ' + val);
            token = node;
            token.from = tok.from;
            token.to = tok.to;
            token.value = token.id = val;
            token.arity = type;
            token.error = tok.error;
            return token;
        }
        
        function expression(rbp) {
            var left, tok = token;
            advance();
            left = tok.nud();
            while (rbp < token.lbp) {
                tok = token;
                advance();
                left = tok.led(left);
            }
            return left;
        }

        function symbol(id, bindingPower) {
            bindingPower = bindingPower || 0;
            var sym = symbols[id];
            if (sym) {
                if (bindingPower > sym.lbp)
                    sym.lbp = bindingPower;
            }
            else {
                sym = {
                    error: function (message) {
                        throw new Error(message);
                    },
                    
                    nud: function () {
                        this.error('Undefined. ' + id);
                    },
            
                    led: function () {
                        this.error('Missing operator.');
                    },
                    
                    lbp: bindingPower
                };
                sym.id = sym.value = id;
                symbols[id] = sym;
            }
            return sym;
        }
        
        function infix(id, bindingPower, led) {
            var sym = symbol(id, bindingPower);
            sym.led = led || function (left) {
                this.left = left;
                this.right = expression(bindingPower);
                this.arity = 'binary';
                return this;
            };
            return sym;
        }
        
        function prefix(id, nud, bindingPower) {
            var sym = symbol(id);
            sym.nud = nud || function () {
                this.right = expression(bindingPower || 10);
                this.arity = 'unary';
                return this;
            };
            return sym;
        }
        
        symbol('(end)');
        symbol('(ident)');
        
        function ledNud(obj, op) {
            obj.right = expression(op.matches ? op.matchPrecedence || 0 : op.precedence || 10);
            if (op.matches)
                advance(op.matches);
        }
        
        function addSymbols(obj, add) {
            for (i in obj) {
                if (obj.hasOwnProperty(i)) {
                    if (obj[i].matches)
                        symbol(obj[i].matches);
                    add(i, obj[i]);
                }
            }
        }
        
        addSymbols(POB, function (id, op) {
            infix(id, op.precedence || 10, function (left) {
                this.left = left;
                this.arity = 'binary';
                ledNud(this, op);
                return this;
            });
        });
        
        addSymbols(POU, function (id, op) {
            prefix(id, function () {
                this.arity = 'unary';
                ledNud(this, op);
                return this;
            });
        });
        
        advance();
        result = expression(0);
        advance('(end)');
        result.query = selector;
        result.tokens = tokens;
        this.cache.push(selector);
        this.cache[selector] = result;
        if (this.cache.length > this.cacheSize)
            this.cache[this.cache.shift()] = undefined;
        return result;
    }
};

Puma.operators = {
    unary: {
    },
    
    binary: {
        '#': function (left, right, context) {
            var leftNodes = left.evaluate(context), elem;
            if (context.getElementById) {
                elem = context.getElementById(right.value);
                if (arrayIndexOf(leftNodes, elem) > -1)
                    return [elem];
                else
                    return [];
            }
            return arrayFilter(context.getElementsByTagName('*'), function (e) {
                return e.id == right.value && arrayIndexOf(leftNodes, e) > -1;
            });
        },
        
        '.': function (left, right, context) {
            var leftNodes = left.evaluate(context);
            if (context.getElementsByClassName) {
                return arrayFilter(context.getElementsByClassName(right.value),
                function (e) {
                    return arrayIndexOf(leftNodes, e) > -1;
                });
            }
            return arrayFilter(context.getElementsByTagName('*'), function (e) {
                return arrayIndexOf(e.className.split(' '), right.value) > -1 &&
                arrayIndexOf(leftNodes, e) > -1;
            });
        },
        
        ',': function (left, right, context) {
            for (var leftNodes = left.evaluate(context), rightNodes = right.evaluate(context),
            i = 0, l = rightNodes.length; i < l; ++i) {
               if (arrayIndexOf(leftNodes, rightNodes[i]) < 0)
                    leftNodes.push(rightNodes[i]);
            }
            return leftNodes;
        },
        
        '>': function (left, right, context) {
            var leftNodes = left.evaluate(context);
            return arrayFilter(right.evaluate(context), function (e) {
                return arrayIndexOf(leftNodes, e.parentNode) > -1;
            });
        },
        
        ' ': function (left, right, context) {
            var leftNodes = left.evaluate(context);
            return arrayFilter(right.evaluate(context), function (e) {
                var parent = e;
                while (parent = parent.parentNode) {
                    if (arrayIndexOf(leftNodes, parent) > -1)
                        return true;
                }
                return false;
            });
        },
        
        '+': function (left, right, context) {
            var leftNodes = left.evaluate(context);
            return arrayFilter(right.evaluate(context), function (e) {
                var sibling = e;
                while (sibling = sibling.previousSibling) {
                    if (sibling.nodeType < 2)
                        return arrayIndexOf(leftNodes, sibling) > -1;
                }
            });
        },
        
        '~': function (left, right, context) {
            var leftNodes = left.evaluate(context);
            return arrayFilter(right.evaluate(context), function (e) {
                var sibling = e;
                while (sibling = sibling.previousSibling) {
                    if (sibling.nodeType < 2 && arrayIndexOf(leftNodes, sibling) > -1)
                        return true;
                }
                return false;
            });
        },
        
        ':': function (left, right, context) {
            var pseudos = Puma.pseudoclasses;
            if (!pseudos[right.value] && !right.left || (right.left && !pseudos[right.left.value]))
                right.error('Unknown pseudoclass ' + (right.value != '(' ? right.value : right.left.value));
            return arrayFilter(left.evaluate(context), function (e) {
                if (right.value == '(')
                    return pseudos[right.left.value](e, right.right, context);
                return pseudos[right.value](e, context);
            });
        },
        
        '(': function () { },
        
        '::': function (left, right, context) {
            var pseudos = Puma.pseudoelements, leftNodes = left.evaluate(context),
            i = 0, l, result = [], pseudoelement;
            if (!pseudos[right.value])
                right.error('Unknown pseudoelement ' + right.value);
            for (l = leftNodes.length; i < l; ++i) {
                pseudoelement = pseudos[right.value](leftNodes[i]);
                if (pseudoelement != null)
                    result.push.apply(result, pseudoelement);
            }
            return result;
        },
        
        '[': function (left, right, context) {
            var leftNodes = left.evaluate(context), rightNodes;
            if (right.arity == 'binary')
                return Puma.operators.binary[right.value](leftNodes, right.left,
                right.right);
            rightNodes = right.evaluate(context);
            return arrayFilter(leftNodes, function (e) {
                return e.hasAttribute(right.value);
            });
        },
        
        '=': function (nodes, left, right) {
            return arrayFilter(nodes, function (e) {
                return e.getAttribute(left.value) == right.value;
            });
        },
        
        '!=': function (nodes, left, right) {
            return arrayFilter(nodes, function (e) {
                return e.getAttribute(left.value) != right.value;
            });
        },
        
        '^=': function (nodes, left, right) {
            return arrayFilter(nodes, function (e) {
                var attr = e.getAttribute(left.value);
                return attr && attr.indexOf(right.value) == 0;
            });
        },
        
        '$=': function (nodes, left, right) {
            return arrayFilter(nodes, function (e) {
                var attr = e.getAttribute(left.value);
                return attr && attr.lastIndexOf(right.value) == attr.length - right.value.length;
            });
        },
        
        '*=': function (nodes, left, right) {
            return arrayFilter(nodes, function (e) {
                var attr = e.getAttribute(left.value);
                return attr && attr.indexOf(right.value) > -1;
            });
        },
        
        '@=': function (nodes, left, right) {
            var parts = right.value.split('/');
            if (parts.length == 1)
              parts = [0, parts[0], ''];
            return arrayFilter(nodes, function (e) {
                return RegExp(parts[1], parts[2]).test(e.getAttribute(left.value));
            });
        }
    }
};

POB = Puma.operators.binary, POU = Puma.operators.unary;

POB['('].precedence = POB['['].precedence = 20;
POB['>'].precedence = POB[' '].precedence = POB['+'].precedence = POB['~'].precedence = 8;
POB[','].precedence = 1;
POB['('].matches = ')';
POB['['].matches = ']';
POB['('].matchPrecedence = POB['['].matchPrecedence = 0;

function unaryOp(op) {
  return function (right, context) {
    return POB[op](new Puma.AST.Tag('*'), right, context);
  };
}

for (i in POB) {
    if (POB.hasOwnProperty(i) && !POU[i]) {
        POU[i] = unaryOp(i);
        POU[i].matches = POB[i].matches;
        POU[i].matchPrecendence = POB[i].matchPrecendence;
    }
}

Puma.pseudoclasses = {
    'contains': function (elem, text) {
        return (elem.innerText || elem.textContent || '').indexOf(text.value) > -1;
    },
    
    'matches': function (elem, regex) {
        var parts = regex.value.split('/');
        if (parts.length == 1)
            parts = [0, parts[0], ''];
        return RegExp(parts[1], parts[2]).test(elem.innerText || elem.textContent || '');
    },
    
    'not': function (elem, expr, context) {
        if (!expr.notCache)
            expr.notCache = expr.evaluate(context);
        return arrayIndexOf(expr.notCache, elem) < 0;
    },
    
    'first-child': function (elem) {
        var children = elem.parentNode.children;
        return children && elem == elem.parentNode.children[0];
    },
    
    'last-child': function (elem) {
        var children = elem.parentNode.children;
        return children && elem == children[children.length - 1];
    },
    
    'nth-child': function (elem, expr) {
        var value = expr.value, a, b;
        if (value == 'n')
            return true;
        if (value == 'odd') {
            a = 2;
            b = 1;
        }
        else if (value == 'even') {
            a = 2;
            b = 0;
        }
        else if (value != '+') {
            a = parseInt(value) || 1;
            b = 0;
        }
        else {
            a = parseInt(expr.left.value) || 1;
            b = +expr.right.value || 0;
        }
        return (arrayIndexOf(elem.parentNode.children, elem) + 1 - b) % a == 0;
    }
};

Puma.pseudoelements = {
};

Puma.noConflict = function () {
    window.Puma = old;
    return Puma;
};

window.Puma = Puma;

})(this);
