**0 Regexes**
**0 Try-catch blocks**
**0 Browser stiffing**



Puma is a new, speedy, CSS selector engine. Extremely lightweight and easily droppable into any library, Puma supports all CSS2 and most CSS3 selectors.

It's syntax is just like Sizzle and friends:

Puma(selector[, DOMElement])


It's also very extensible: you can add new pseudoclasses or operators any time you want. Let's say we want to define the @ operator for matching the rel attribute:

Puma.operators.binary['@'] = function (left, right, context) {
    return Puma.arrayFilter(left.evaluate(context), function (e) {
        return e.getAttribute('rel') == right.value;
    });
};

This code simply evaluates the left side of the parse tree and reduces it to the elements with the specified value for the rel attribute. You can use it like 'div@stuff' or 'img[src^="/assets/images"]@myrel.theClass'.

Since it also adds it as a unary operator be default (as long as there is no unary operator that already exists with that name), you can do '@therel:nth-child(even)' also. If you don't want it to be automatically added, simply do:

Puma.operators.binary['@'].noUnary = true;


More documentation on extension will be available sometime when I get around to it (hopefully within the next few years :-P).