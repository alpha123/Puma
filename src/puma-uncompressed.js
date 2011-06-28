(function (window, undefined) {

function Puma(selector, context) {
    var pc = Puma.parseCache, tree;
    if (pc[selector])
        tree = pc[selector];
    else {
        tree = Puma.Parser.parse(selector);
        pc[selector] = tree;
        pc.push(selector);
        if (pc.length > Puma.parseCacheSize)
            pc[pc.shift()] = undefined;
    }
    return tree.evaluate(context || document);
}

Puma.parseCache = [];
Puma.parseCacheSize = 100;

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

Puma.arrayIndexOf = arrayIndexOf;
Puma.arrayFilter = arrayFilter;

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
    parse: function (selector) {
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
                if (bindingPower >= sym.lbp)
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
        
        for (i in POB) {
            if (POB.hasOwnProperty(i)) {
                (function (op) {
                    if (op.matches)
                        symbol(op.matches);
                    infix(i, op.precedence || 10, function (left) {
                        this.left = left;
                        this.arity = 'binary';
                        ledNud(this, op);
                        return this;
                    });
                })(POB[i]);
            }
        }
        
        for (i in POU) {
            if (POU.hasOwnProperty(i)) {
                (function (op) {
                    if (op.matches)
                        symbol(op.matches);
                    prefix(i, function () {
                        this.arity = 'unary';
                        ledNud(this, op);
                        return this;
                    });
                })(POU[i]);
            }
        }
        
        advance();
        result = expression(0);
        advance('(end)');
        result.query = selector;
        result.tokens = tokens;
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
                return arrayIndexOf(leftNodes, e.parentNode) >= 0;
            });
        },
        
        ' ': function (left, right, context) {
            var leftNodes = left.evaluate(context);
            return arrayFilter(right.evaluate(context), function (e) {
                var parent = e;
                while (parent = parent.parentNode) {
                    if (arrayIndexOf(leftNodes, parent) >= 0)
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
                    if (sibling.nodeType == 1)
                        return arrayIndexOf(leftNodes, sibling) >= 0;
                }
            });
        },
        
        '~': function (left, right, context) {
            var leftNodes = left.evaluate(context);
            return arrayFilter(right.evaluate(context), function (e) {
                var sibling = e;
                while (sibling = sibling.previousSibling) {
                    if (sibling.nodeType == 1 && arrayIndexOf(leftNodes, sibling) >= 0)
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
                return pseudos[right.value](e);
            });
        },
        
        '(': function () { },
        
        '::': function (left, right, context) {
            var pseudos = Puma.pseudoelements, leftNodes, i = 0, l, result = [],
            pseudoelement;
            if (!pseudos[right.value])
                right.error('Unknown pseudoelement ' + right.value);
            for (leftNodes = left.evaluate(context), l = leftNodes.length; i < l; ++i) {
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
                return attr && attr.indexOf(right.value) >= 0;
            });
        },
        
        '@=': function (nodes, left, right) {
            var parts = right.value.split('/');
            if (parts.length == 1)
              parts = [0, parts[0], ''];
            return arrayFilter(nodes, function (e) {
                return (new RegExp(parts[1], parts[2])).test(e.getAttribute(left.value));
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
    if (POB.hasOwnProperty(i) && !POU[i] && !POB[i].noUnary) {
        POU[i] = unaryOp(i);
        POU[i].matches = POB[i].matches;
        POU[i].matchPrecendence = POB[i].matchPrecendence;
    }
}

Puma.pseudoclasses = {
    'contains': function (elem, text) {
        var innerText = elem.innerText || elem.textContent || '';
        return innerText.indexOf(text.value) >= 0;
    },
    
    
    'matches': function (elem, regex) {
        var parts = regex.value.split('/');
        if (parts.length == 1)
            parts = [0, parts[0], ''];
        return (new RegExp(parts[1], parts[2])).test(elem.innerText || elem.textContent || '');
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
        var n = expr.value;
        if (n == 'n')
            return true;
        if (n == 'odd')
            return arrayIndexOf(elem.parentNode.children, elem) % 2 == 0;
        if (n == 'even')
            return arrayIndexOf(elem.parentNode.children, elem) % 2 == 1;
        if (!expr.nthChildCache) {
            if (n.length == 1 && n != '+') {
                expr.nthChildCache = function (e) {
                    return arrayIndexOf(e.parentNode.children, e) == n - 1;
                };
            }
            else if (n == '+') {
                expr.nthChildCache = function (e) {
                    for (var idx = arrayIndexOf(e.parentNode.children, e),
                    x = parseInt(expr.right.value) - 1,
                    y = expr.left.value.length > 1 ? parseInt(expr.left.value.length) : 0,
                    i = 0, l = e.parentNode.children.length; i < l; ++i) {
                        if (idx == i * y + x)
                            return true;
                    }
                    return false;
                };
            }
            else {
                expr.nthChildCache = function (e) {
                    for (var idx = arrayIndexOf(e.parentNode.children, e) + 1,
                    x = parseInt(n), i = 0, l = e.parentNode.children.length; i < l; ++i) {
                        if (idx == i * x)
                            return true;
                    }
                    return false;
                };
            }
        }
        return expr.nthChildCache(elem);
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
