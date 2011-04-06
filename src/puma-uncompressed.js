function Puma(selector, context) {
    return (new Puma.Parser(selector)).parse().evaluate(context || document);
}

Puma.AST = {
    Tag: function (value) {
        this.value = value;
        this.evaluate = function (context) {
            return [].slice.call(context.getElementsByTagName(value));
        };
    },
    
    BinOp: function (value, left, right) {
        this.value = value;
        this.left = left;
        this.right = right;
        this.evaluate = function (context) {
            var op = Puma.operators.binary[value], matches = [], elems, i;
            if (op.noIter)
                return op(this.left, this.right, context);
            elems = context.getElementsByTagName('*');
            i = elems.length;
            while (i--) {
                if(op(elems[i], this.left, this.right, context))
                    matches.push(elems[i]);
            }
            return matches;
        };
    },
    
    UnOp: function (value, right) {
        this.value = value;
        this.right = right;
        this.evaluate = function (context) {
            var op =  Puma.operators.unary[value], matches = [], elems, i;
            if (op.noIter)
                return op(this.right, context);
            elems = context.getElementsByTagName('*');
            i = elems.length;
            while (i--) {
                if(op(elems[i], this.right, context))
                    matches.push(elems[i]);
            }
            return matches;
        };
    }
};

// A scanner and top-down operator precendence parser for CSS selectors.
// Technique and code inspired by Douglas Crockford's article
// "Top Down Operator Precendence"
// http://javascript.crockford.com/tdop/tdop.html

Puma.Scanner = function (selector) {
    this.scan = function () {
        var current = selector.charAt(0), i = 0, from, str, oper,
        length = selector.length, tokens = [], chars = '0123456789-_';
    
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
        function test(character) {
            return ((character >= 'a' && character <= 'z') || (character >= 'A'
            && character <= 'Z') || chars.indexOf(character) != -1) && character;
        }
        while (current) {
            from = i;
            if (current == ' ') {
                current = selector.charAt(++i);
                var old = selector.charAt(i - 2);
                if ((test(current) || current == '*' || Puma.operators.unary[current]) &&
                (test(old) || old == '*'))
                    tokens.push(makeToken('op', ' '));
            }
            else if (test(current)) {
                str = [current];
                ++i;
                while (1) {
                    current = selector.charAt(i);
                    if (test(current)) {
                        str.push(current);
                        ++i;
                    }
                    else
                        break;
                }
                tokens.push(makeToken('ident', str.join('')));
            }
            else if (current == '"' || current == "'") {
                str = [];
                var quote = current;
                while (1) {
                    current = selector.charAt(++i);
                    if (current < ' ')
                        makeToken('ident', str.join('')).error('Bad string');
                    if (current == quote)
                        break;
                    if (current == '\\') {
                        if (++i >= length)
                            makeToken('ident', str.join('')).error('Bad string');
                        current = '\\' + selector.charAt(i);
                    }
                    str.push(current);
                }
                tokens.push(makeToken('ident', str.join('')));
                current = selector.charAt(++i);
            }
            else if (current == '*' && selector.charAt(i + 1) != '=') {
                tokens.push(makeToken('ident', current));
                current = selector.charAt(++i);
            }
            else {
                oper = [current];
                current = selector.charAt(++i);
                var old = selector.charAt(i - 1);
                if ((current == '*' || !test(current)) && current != ' ' && old != '[' &&
                old != ']' && old != '(' && old != ')' && current != '"' && current != "'") {
                    oper.push(current);
                    current = selector.charAt(++i);
                }
                tokens.push(makeToken('op', oper.join('')));
            }
        }
        return tokens;
    };
};

Puma.Parser = function (selector) {
    this.parse = function () {
        var symbols = {}, token, tokens = (new Puma.Scanner(selector)).scan(),
        tokenNum = 0, result, i;
        
        function clone(obj) {
            var newObj = {}, i;
            for (i in obj)
                newObj[i] = obj[i];
            return newObj;
        }
        
        function advance(id) {
            if (id && token.id != id)
                token.error('Expected ' + id + ', not ' + token.id);
            if (tokenNum >= tokens.length) {
                token = symbols['(end)'];
                return;
            }
            var tok = tokens[tokenNum++],
            val = tok.value, type = tok.type, node, i;
            if (type == 'ident') {
                node = new Puma.AST.Tag(val);
                node.nud = function () {
                    return this;
                };
                node.led = null;
                node.lbp = 0;
            }
            else if (type == 'op') {
                if (!symbols[val])
                    tok.error('Unknown operator ' + val);
                if (Puma.operators.unary[val] && (!tokens[tokenNum - 2] ||
                tokens[tokenNum - 2].type == 'op'))
                    node = new Puma.AST.UnOp(val, tok.first);
                else
                    node = new Puma.AST.BinOp(val, tok.first, tok.second);
                for (i in symbols[val])
                    node[i] = symbols[val][i];
            }
            else
                tok.error('Unexpected token ' + val);
            token = clone(node);
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
            
                    led: function (left) {
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
                this.first = this.left = left;
                this.second = this.right = expression(bindingPower);
                this.arity = 'binary';
                return this;
            };
            return sym;
        }
        
        function prefix(id, nud) {
            var sym = symbol(id);
            sym.nud = nud || function () {
                this.first = this.right = expression(10);
                this.arity = 'unary';
                return this;
            };
        }

        symbol(']');
        symbol(')');
        symbol('(end)');
        symbol('(ident)');
        
        for (i in Puma.operators.binary)
            infix(i, Puma.operators.binary[i].precendence || 10);
        
        infix('[', 20, function (left) {
            this.first = this.left = left;
            this.second = this.right = expression(0);
            this.arity = 'binary';
            advance(']');
            return this;
        });
        
        infix('(', 20, function (left) {
            this.first = this.left = left;
            this.second = this.right = expression(0);
            this.arity = 'binary';
            advance(')');
            return this;
        });
        
        for (i in Puma.operators.unary)
            prefix(i);
        
        advance();
        result = expression(0);
        advance('(end)');
        return result;
    };
};

(function () {

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

Puma.operators = {
    unary: {
        '#': function (right, context) {
            if (context.getElementById)
                return [context.getElementById(right.value)];
            return arrayFilter(right.evaluate(context), function (e) {
                return e.id == right.value;
            });
        },
        
        '.': function (right, context) {
            if (context.getElementsByClassName)
                return [].slice.call(context.getElementsByClassName(right.value));
            return arrayFilter(right.evaluate(context), function (e) {
                return arrayIndexOf(e.className.split(' '), right.value) != -1;
            });
        }
    },
    
    binary: {
        '#': function (left, right, context) {
            if (context.getElementById) {
                var elem = context.getElementById(right.value);
                if (elem.tagName.toUpperCase() == left.value.toUpperCase())
                    return [elem];
            }
            return arrayFilter(context.getElementsByTagName('*'), function (e) {
                return e.id == right.value && e.tagName.toUpperCase() == right.value.toUpperCase();
            });
        },
        
        '.': function (left, right, context) {
            if (context.getElementsByClassName) {
                var elems = context.getElementsByClassName(right.value), filter =
                arrayFilter(elems, function (e) {
                    return e.tagName.toUpperCase() == left.value.toUpperCase();
                });
                if (filter.length)
                    return filter;
            }
            return arrayFilter(context.getElementsByTagName('*'), function (e) {
                return arrayIndexOf(e.className.split(' '), right.value) != -1
                && e.tagName.toUpperCase() == left.value.toUpperCase();
            });
        },
        
        ',': function (left, right, context) {
            var leftNodes = left.evaluate(context);
            leftNodes.push.apply(leftNodes, right.evaluate(context));
            return leftNodes;
        },
        
        '>': function (left, right, context) {
            var leftNodes = left.evaluate(context);
            return arrayFilter(right.evaluate(context), function (e) {
                return arrayIndexOf(leftNodes, e.parentNode) != -1;
            });
        },
        
        ' ': function (left, right, context) {
            var leftNodes = left.evaluate(context);
            return arrayFilter(right.evaluate(context), function (e) {
                var parent = e;
                while (parent = parent.parentNode) {
                    if (arrayIndexOf(leftNodes, parent) != -1)
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
                    if (sibling.nodeType != 1)
                        continue;
                    if (arrayIndexOf(leftNodes, sibling) != -1)
                        return true;
                    return false;
                }
            });
        },
        
        '~': function (left, right, context) {
            var leftNodes = left.evaluate(context);
            return arrayFilter(right.evaluate(context), function (e) {
                var sibling = e;
                while (sibling = sibling.previousSibling) {
                    if (arrayIndexOf(leftNodes, sibling) != -1)
                        return true;
                }
                return false;
            });
        },
        
        ':': function (left, right, context) {
            var pseudos = Puma.pseudoclasses;
            return arrayFilter(left.evaluate(context), function (e) {
                if (right.value == '(')
                    return pseudos[right.left.value](e, right.right, context);
                return pseudos[right.value](e);
            });
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
                return attr && attr.indexOf(right.value) != -1;
            });
        },
        
        '~=': function (nodes, left, right) {
            return arrayFilter(nodes, function (e) {
                var attr = e.getAttribute(left.value);
                return attr && arrayIndexOf(attr.split(' '), right.value) != -1;
            });
        },
        
        '|=': function (nodes, left, right) { // Tell me, WHY do we have this selector?
            return arrayFilter(nodes, function (e) {
                var attr = e.getAttribute(left.value);
                return attr && (attr.indexOf(right.value) != -1 ||
                attr.indexOf(right.value + '-') != -1);
            });
        }
    }
};

Puma.operators.arrayIndexOf = arrayIndexOf;
Puma.operators.arrayFilter = arrayFilter;

var POB = Puma.operators.binary, POU = Puma.operators.unary;

POB[','].precendence = POB['>'].precendence = POB[' '].precendence =
POB['+'].precendence = POB['~'].precendence = 8;

POB['#'].noIter = POB['.'].noIter = POB[','].noIter = POB['>'].noIter =
POB[' '].noIter = POB['+'].noIter = POB['~'].noIter = POB[':'].noIter =
POB['['].noIter = POU['#'].noIter = POU['.'].noIter = true;

Puma.pseudoclasses = {
    'contains': function (elem, text) {
        return (elem.innerText || elem.textContent).indexOf(text.value) != -1;
    },
    
    'not': function (elem, expr, context) {
        if (!context.notCache)
            context.notCache = expr.evaluate(context);
        return arrayIndexOf(context.notCache, elem) == -1;
    },
    
    'first-child': function (elem) {
        return elem == elem.parentNode.children[0];
    },
    
    'last-child': function (elem) {
        var children = elem.parentNode.children;
        return elem == children[children.length - 1];
    },
    
    'only-child': function (elem) {
        var children = elem.parentNode.children;
        return children.length == 1 && children[0] == elem;
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

})();
