const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('test.html', 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;
const NodeFilter = dom.window.NodeFilter;

function getStableText(el) {
    if (!el) return '';
    let raw = '';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
            if (node.parentElement && node.parentElement.hasAttribute('data-gx-page-translated')) {
                return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    let currentNode;
    while ((currentNode = walker.nextNode())) {
        raw += currentNode.nodeValue;
    }

    return raw
        .replace(/\u00A0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .trim();
}

const tweets = document.querySelectorAll('[data-testid="tweetText"]');
console.log(`Found ${tweets.length} tweets.`);
tweets.forEach((t, i) => {
    const text = getStableText(t);
    console.log(`Tweet ${i} exact text:`, JSON.stringify(text));
});
