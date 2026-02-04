// --- Floating Panel UI Construction ---
const PANEL_CLASS_EXPANDED = 'css-175oi2r r-105ug2t r-14lw9ot r-1867qdf r-1upvrn0 r-13awgt0 r-1ce3o0f r-1udh08x r-u8s1d r-13qz1uu';
const PANEL_CLASS_MINIMIZED = 'css-175oi2r r-105ug2t r-1867qdf r-1upvrn0 r-13awgt0 r-1ce3o0f r-1udh08x r-u8s1d r-13qz1uu r-173mn98 r-1e5uvyk r-6026j r-1xsrhxi r-rs99b7 r-12jitg0';
const PANEL_MARGIN = {
    expandedTop: 18,
    expandedRight: 12,
    minimizedTop: 80,
    minimizedBottom: 200,
    minimizedRight: 12
};
const PANEL_Z_INDEX_EXPANDED = 2147483647;
const PANEL_Z_INDEX_MINIMIZED = 2147483000;
const MINIMIZED_LEFT_OFFSET_PX = 0;

// Shared Dock Logic
function ensureDock() {
    let dock = document.getElementById('gemini-dock');
    if (!dock) {
        dock = document.createElement('div');
        dock.id = 'gemini-dock';
        dock.style.cssText = 'position:fixed; right:16px; top:80px; z-index:2147483600; display:flex; flex-direction:column; gap:12px; align-items:flex-end; pointer-events:none;';
        document.body.appendChild(dock);
    }
    return dock;
}

function attachToDock(panel, order = 0) {
    const dock = ensureDock();
    panel.dataset.gemDockOrder = order;
    dock.appendChild(panel);
    Array.from(dock.children)
        .sort((a, b) => (parseInt(a.dataset.gemDockOrder || '0', 10) - parseInt(b.dataset.gemDockOrder || '0', 10)))
        .forEach((el) => dock.appendChild(el));

    // Reset styles first to ensure clean slate
    panel.style.cssText = '';

    // Apply strict styles from standard template
    panel.style.setProperty('position', 'static', 'important');
    panel.style.setProperty('width', '56px', 'important');
    panel.style.setProperty('height', '56px', 'important');
    panel.style.setProperty('min-width', '56px', 'important');
    panel.style.setProperty('margin', '0', 'important');
    panel.style.setProperty('padding', '0', 'important');
    panel.style.setProperty('box-sizing', 'border-box', 'important');
    panel.style.setProperty('display', 'block', 'important');
    panel.style.setProperty('align-self', 'flex-end', 'important');
    panel.style.setProperty('pointer-events', 'auto', 'important');
    panel.style.setProperty('z-index', 'auto', 'important');
    panel.style.setProperty('float', 'none', 'important');
    panel.style.setProperty('clear', 'none', 'important');
    panel.style.setProperty('inset', 'auto', 'important');

    dock.style.pointerEvents = 'none';
}

// Coexistence guard: avoid multiple extensions rewriting the same tweet node.
const GEM_LAB_OWNER_ID = 'translator';
function canMutateTweetElement(el) {
    const owner = el?.dataset?.gemLabOwner;
    return !owner || owner === GEM_LAB_OWNER_ID;
}
function claimTweetElement(el) {
    if (!el?.dataset) return false;
    if (!canMutateTweetElement(el)) return false;
    el.dataset.gemLabOwner = GEM_LAB_OWNER_ID;
    return true;
}

function createPanel() {
    // Cleanup duplicates first
    const existing = document.querySelectorAll('[id^="gemini-x-panel"]');
    existing.forEach(p => p.remove());

    const section = document.createElement('div');
    section.id = 'gemini-x-panel';
    // Base generic classes for container
    section.style.cssText = `
        position: fixed;
        z-index: ${PANEL_Z_INDEX_MINIMIZED};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;
    // Default to minimized position to avoid initial flicker
    section.style.top = `${PANEL_MARGIN.minimizedTop}px`;
    section.style.right = `${PANEL_MARGIN.minimizedRight + MINIMIZED_LEFT_OFFSET_PX}px`;
    section.style.bottom = 'auto';
    section.style.left = 'auto';
    section.style.width = 'auto';

    // Icons
    // 1. Minimized Icon (Gemini "T")
    const geminiIconSvg = `<span aria-hidden="true" style="display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 24px; font-weight: 800; line-height: 1; font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; color: currentColor;">T</span>`;

    // 2. Minimize Icon (match Banana)
    const closeIconSvg = `<svg viewBox="0 0 24 24" aria-hidden="true" style="color: #536471; width: 18px; height: 18px;"><g><path d="M19 13v6h-6v-2h2.586l-3.793-3.793 1.414-1.414L17 15.586V13h2zM11 5v2H8.414l3.793 3.793-1.414 1.414L7 8.414V11H5V5h6z" fill="currentColor"></path></g></svg>`;

		    section.innerHTML = `
	        <style>
                #gx-expanded-view, #gx-minimized-button {
                    --gx-accent: #cfd9de;
                    --gx-green: #2ecc71;
                    --gx-green-soft: #cfead6;
                    --gx-grey-soft: #e6ecf0;
                    --gx-ring: 2px;
                }
	            #gx-expanded-view {
	                transform-origin: top right;
	                transition: opacity 220ms ease, transform 260ms cubic-bezier(0.2, 0.9, 0.2, 1);
	            }
            #gx-minimized-view {
                transform-origin: top right;
                transition: opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.9, 0.2, 1);
            }
            #gx-minimize-btn:hover { background: rgba(15,20,25,0.10) !important; border-color: #d1d5db !important; }
            #gx-minimize-btn:active { background: rgba(15,20,25,0.14) !important; }
            #gx-settings-toggle:hover { opacity: 0.95; }
            #gx-save:hover { background-color: #272c30 !important; }
            #gx-onboard-save:hover { background-color: #272c30 !important; }
            #gx-save.gx-save--dirty { background-color: #e5e7eb !important; color: #0f1419 !important; border-color: #2ecc71 !important; box-shadow: rgba(46,204,113,0.22) 0 0 0 4px; }
            #gx-save.gx-save--dirty:hover { background-color: #dbe0e6 !important; }
            .gx-hidden {
                opacity: 0;
                transform: scale(0.92);
                pointer-events: none;
            }
            .gx-visible {
                opacity: 1;
                transform: scale(1);
            }
	        </style>
	        <!-- EXPANDED VIEW -->
	        <div id="gx-expanded-view" class="css-175oi2r r-105ug2t r-14lw9ot r-1867qdf r-1upvrn0 r-13awgt0 r-1ce3o0f r-1udh08x r-u8s1d r-13qz1uu gx-hidden" style="width: 300px; max-height: 80vh; display: none; flex-direction: column; box-shadow: rgba(101, 119, 134, 0.2) 0px 0px 15px, rgba(101, 119, 134, 0.15) 0px 0px 3px 1px; border-radius: 16px; background-color: white; position: relative; border: 2px solid var(--gx-accent); overflow: hidden;">
	            <button id="gx-minimize-btn" type="button" aria-label="小さくする" title="小さくする" style="position: absolute; top: 8px; right: 8px; background: rgba(15,20,25,0.06); border: 1px solid #e5e7eb; border-radius: 9999px; width: 34px; height: 34px; display: flex; justify-content: center; align-items: center; cursor: pointer; transition: background 0.2s, border-color 0.2s; z-index: 1; box-shadow: rgba(15, 20, 25, 0.06) 0 1px 0;">
	                 ${closeIconSvg}
	            </button>
            <!-- Onboarding Overlay -->
            <form id="gx-onboard" autocomplete="off" style="display:none; position:absolute; inset:0; background: #ffffff; border-radius:16px; padding:20px 18px 18px 18px; z-index:2; box-shadow: rgba(0,0,0,0.06) 0 8px 30px;">
                <div style="font-weight:800; font-size:16px; margin-bottom:8px; color:#0f1419;">はじめに</div>
                <div style="font-size:13px; color:#536471; line-height:1.5; margin-bottom:14px;">GeminiのAPIキーを入力してモデルを選ぶと自動翻訳が始まります。</div>
                <label style="display:block; font-size:12px; font-weight:700; color:#0f1419; margin-bottom:6px;">API Key</label>
                <input type="text" id="gx-onboard-user" autocomplete="username" placeholder="Username" style="position:absolute; left:-9999px; width:1px; height:1px; opacity:0;">
                <input type="password" id="gx-onboard-key" autocomplete="new-password" placeholder="AI Studio Key" style="width:100%; border:1px solid #cfd9de; border-radius:8px; padding:10px 12px; font-size:14px; margin-bottom:14px; outline:none;">
                <label style="display:block; font-size:12px; font-weight:700; color:#0f1419; margin-bottom:6px;">モデル</label>
                <select id="gx-onboard-model" style="width:100%; border:1px solid #cfd9de; border-radius:8px; padding:10px 12px; font-size:14px; margin-bottom:18px; background:white; appearance:none; -webkit-appearance:none;">
                    <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash-Lite</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                </select>
                <button id="gx-onboard-save" type="button" style="width:100%; background-color:#0f1419; color:#ffffff; border:2px solid transparent; padding:12px; border-radius:9999px; font-weight:700; font-size:14px; cursor:pointer; transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;">保存して開始</button>
                <div id="gx-onboard-msg" style="font-size:12px; color:#00ba7c; margin-top:8px; min-height:16px;"></div>
            </form>
            
            <!-- Header -->
	            <div id="gx-header" class="css-175oi2r" style="cursor: move; padding: 12px 16px 8px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eff3f4; min-height: 50px;">
		                <div style="font-weight: 800; font-size: 15px; color: #0f1419;">Gemini Translator</div>
		            </div>

            
	            <!-- Body -->
	            <div id="gx-body" style="padding: 16px; overflow-y: auto;">
	                
	                <!-- Auto Translate Toggle -->
	                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
	                    <span style="font-size: 14px; font-weight: 700; color: #0f1419;">自動翻訳</span>
	                    <label style="position: relative; display: inline-block; width: 44px; height: 24px;">
	                        <input type="checkbox" id="gx-toggle" checked style="opacity: 0; width: 0; height: 0;">
	                        <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgb(29, 155, 240); transition: .4s; border-radius: 24px;"></span>
	                        <span id="gx-slider-knob" style="position: absolute; content: ''; height: 20px; width: 20px; left: 2px; bottom: 2px; background-color: white; transition: .4s; border-radius: 50%; transform: translateX(20px);"></span>
	                    </label>
	                </div>

                    <!-- Quick Actions -->
                    <div style="display:flex; gap:10px; margin-bottom: 16px;">
                        <button id="gx-translate-once" type="button" style="flex:1; background:#1d9bf0; color:white; border:none; padding:10px 12px; border-radius:9999px; cursor:pointer; font-weight:800; font-size: 13px;">表示中を翻訳</button>
                        <button id="gx-reset" type="button" style="flex:1; background:#f7f9f9; color:#0f1419; border:1px solid #cfd9de; padding:10px 12px; border-radius:9999px; cursor:pointer; font-weight:800; font-size: 13px;">元に戻す</button>
                    </div>

	                <!-- Stats Card -->
	                <div style="background-color: #f7f9f9; padding: 12px 16px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #eff3f4;">
	                    <div style="font-size: 11px; color: #536471; font-weight: 500;">推定コスト (モデル別目安)</div>
	                    <div id="gx-cost" style="font-size: 22px; font-weight: 800; color: #0f1419; margin: 4px 0 8px 0;">$0.0000</div>
                        <div id="gx-total-usage" style="font-size: 11px; color: #536471; margin-bottom: 6px; line-height: 1.35;"></div>
	                    <div style="font-size: 11px; color: #536471; display: flex; justify-content: space-between;">
	                        <span>In: <b id="gx-input-chars" style="color: #0f1419;">0</b></span>
	                        <span>Out: <b id="gx-output-chars" style="color: #0f1419;">0</b></span>
	                    </div>
	                </div>

	                <!-- Settings Section -->
	                <button id="gx-settings-toggle" aria-expanded="false" title="クリックで開閉" style="width: 100%; text-align: left; background: none; border: none; padding: 6px 0; margin-top: 12px; margin-bottom: 8px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #2ecc71; font-weight: 600; font-size: 13px;">
                        <span style="display:flex; align-items:center; gap:8px;">
	                         <span style="font-size: 16px;">⚙️</span>
                             設定（モデル・キー）
                        </span>
                        <span id="gx-settings-chevron" aria-hidden="true" style="display:inline-flex; align-items:center; justify-content:center; width: 22px; height: 22px; border-radius: 9999px; border: 1px solid rgba(46,204,113,0.35); color:#2ecc71; font-weight: 900; font-size: 12px; line-height: 1; transform: rotate(0deg); transition: transform 160ms ease;">▾</span>
                    </button>
                
	                <div id="gx-settings-content" style="display: none; margin-top: 6px; margin-bottom: 18px;">
                        <!-- Privacy Note -->
                        <div style="margin: 0 0 14px 0; padding: 10px 12px; border: 1px solid #eff3f4; border-radius: 10px; background-color: #ffffff;">
                            <div style="font-size: 11px; font-weight: 800; color: #0f1419; margin-bottom: 4px;">プライバシー</div>
	                            <div style="font-size: 11px; color: #536471; line-height: 1.45;">
	                                翻訳のために、ツイート本文テキストが Google の Gemini API に送信されます。保存はローカル（APIキー/設定/文字数統計）のみです。
	                            </div>
                                <button id="gx-open-options" type="button" style="margin-top:10px; width:100%; background:#f7f9f9; color:#0f1419; border:1px solid #cfd9de; padding:10px 12px; border-radius:9999px; cursor:pointer; font-weight:800; font-size: 13px;">詳細設定を開く</button>
	                        </div>
		                    
		                    <!-- Model Select -->
	                    <div style="margin-bottom: 15px;">
	                        <label style="display: block; font-size: 13px; margin-bottom: 6px; font-weight: 700; color: #0f1419;">モデル</label>
                        <div style="position: relative;">
                            <select id="gx-model" style="width: 100%; appearance: none; -webkit-appearance: none; background-color: white; border: 1px solid #cfd9de; border-radius: 8px; padding: 10px 32px 10px 12px; font-size: 14px; color: #0f1419; font-weight: 500; cursor: pointer;">
                                <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash-Lite</option>
                                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</option>
                                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                            </select>
                            <div style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #536471;">
                                <svg viewBox="0 0 24 24" aria-hidden="true" style="width: 16px; height: 16px; fill: currentColor;"><path d="M3.543 8.96l1.414-1.42L12 14.59l7.043-7.05 1.414 1.42L12 17.41 3.543 8.96z"></path></svg>
                            </div>
	                        </div>
	                    </div>

                        <!-- Direction -->
	                        <div style="margin-bottom: 15px;">
	                            <label style="display: block; font-size: 13px; margin-bottom: 6px; font-weight: 700; color: #0f1419;">翻訳方向</label>
	                            <select id="gx-direction" style="width: 100%; appearance: none; -webkit-appearance: none; background-color: white; border: 1px solid #cfd9de; border-radius: 8px; padding: 10px 32px 10px 12px; font-size: 14px; color: #0f1419; font-weight: 500; cursor: pointer;">
	                                <option value="en_to_ja">英/韓/中 → 日本語</option>
	                                <option value="ja_to_en">日本語 → 英語</option>
	                            </select>
	                        </div>

	                    <!-- API Key -->
	                    <form id="gx-key-form" autocomplete="off">
	                        <div style="margin-bottom: 20px;">
	                            <label style="display: block; font-size: 13px; margin-bottom: 6px; font-weight: 700; color: #0f1419;">API Key</label>
	                            <input type="text" id="gx-user" autocomplete="username" placeholder="Username" style="position:absolute; left:-9999px; width:1px; height:1px; opacity:0;">
	                            <input type="password" id="gx-apikey" autocomplete="new-password" placeholder="AI Studio Key" style="width: 100%; border: 1px solid #cfd9de; border-radius: 8px; padding: 10px 12px; font-size: 14px; color: #0f1419; box-sizing: border-box; outline: none; transition: border 0.2s;">
	                        </div>
	                    </form>
		                </div>

                        <button id="gx-save" style="width: 100%; margin-top: 16px; background-color: #0f1419; color: white; border: 2px solid transparent; padding: 12px; border-radius: 9999px; cursor: pointer; font-weight: 700; font-size: 14px; transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;">保存</button>
                        <div id="gx-meta" style="text-align:center; font-size: 11px; color:#536471; margin-top: 8px; line-height: 1.45;">
                            <span id="gx-meta-version">バージョン -</span>
                            <span> / </span>
                            <a id="gx-meta-author" href="https://bit.ly/4shaBYM" target="_blank" rel="noopener noreferrer" style="color:#2ecc71; text-decoration: none; font-weight: 900;">Mojofull</a>
                            <span> が作りました</span>
                        </div>
                        <div id="gx-msg" style="text-align: center; font-size: 12px; margin-top: 8px; min-height: 16px; color: #00ba7c;"></div>
		            </div>
		        </div>

        <!-- MINIMIZED VIEW (Grok Button Style - Square) -->
        <div id="gx-minimized-view" class="gx-visible" style="display: block; cursor: pointer;">
	             <div id="gx-minimized-button" class="css-175oi2r r-105ug2t r-1867qdf r-1upvrn0 r-13awgt0 r-1ce3o0f r-1udh08x r-u8s1d r-13qz1uu r-173mn98 r-1e5uvyk r-6026j r-1xsrhxi r-rs99b7 r-12jitg0" style="width: 56px; height: 56px; border-radius: 12px; color: #0f1419; background-color: #ffffff; opacity: 1; filter: none; backdrop-filter: none; box-shadow: rgba(101, 119, 134, 0.2) 0px 0px 8px, rgba(101, 119, 134, 0.25) 0px 1px 3px 1px; border: var(--gx-ring) solid var(--gx-accent);">
                <button role="button" class="css-175oi2r r-6koalj r-eqz5dr r-16y2uox r-1pi2tsx r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l" type="button" style="align-items: center; justify-content: center; width: 100%; height: 100%; background: transparent; border: none; padding: 0; cursor: pointer;">
                    <div class="css-175oi2r" style="color: currentColor;">
                        ${geminiIconSvg}
                    </div>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(section);
    section.style.display = 'none';
    setupPanelLogic(section);
}

// --- Panel Logic ---
function setupPanelLogic(panel) {
    // Elements
    const expandedView = panel.querySelector('#gx-expanded-view');
    const minimizedView = panel.querySelector('#gx-minimized-view');
    const header = panel.querySelector('#gx-header');
    const minimizeBtn = panel.querySelector('#gx-minimize-btn');
    const minimizedButton = panel.querySelector('#gx-minimized-button');
    const toggle = panel.querySelector('#gx-toggle');
    const knob = panel.querySelector('#gx-slider-knob');
    const costEl = panel.querySelector('#gx-cost');
    const totalUsageEl = panel.querySelector('#gx-total-usage');
    const inputCharsEl = panel.querySelector('#gx-input-chars');
    const outputCharsEl = panel.querySelector('#gx-output-chars');
    const translateOnceBtn = panel.querySelector('#gx-translate-once');
    const resetBtn = panel.querySelector('#gx-reset');
    const settingsToggle = panel.querySelector('#gx-settings-toggle');
    const settingsContent = panel.querySelector('#gx-settings-content');
    const settingsChevron = panel.querySelector('#gx-settings-chevron');
    const openOptionsBtn = panel.querySelector('#gx-open-options');
    const modelSelect = panel.querySelector('#gx-model');
    const directionSelect = panel.querySelector('#gx-direction');
    const apiKeyInput = panel.querySelector('#gx-apikey');
    const saveBtn = panel.querySelector('#gx-save');
    const msgEl = panel.querySelector('#gx-msg');
    const metaVersionEl = panel.querySelector('#gx-meta-version');
    const metaAuthorEl = panel.querySelector('#gx-meta-author');
    const onboard = panel.querySelector('#gx-onboard');
    const onboardKey = panel.querySelector('#gx-onboard-key');
    const onboardModel = panel.querySelector('#gx-onboard-model');
    const onboardSave = panel.querySelector('#gx-onboard-save');
    const onboardMsg = panel.querySelector('#gx-onboard-msg');

    // Prevent form submission (Enter key) from navigating/reloading the page.
    const keyForm = panel.querySelector('#gx-key-form');
    onboard?.addEventListener('submit', (e) => e.preventDefault());
    keyForm?.addEventListener('submit', (e) => e.preventDefault());


    // Draggable State
    let expandedPosition = null;
    let savedKeySnapshot = '';
    let savedModelSnapshot = DEFAULT_MODEL;

    // State Logic for Min/Max
    const setPanelFixedPosition = ({ topPx = null, rightPx = '12px', bottomPx = null }) => {
        if (bottomPx !== null) {
            panel.style.setProperty('bottom', bottomPx, 'important');
            panel.style.setProperty('top', 'auto', 'important');
        } else if (topPx !== null) {
            panel.style.setProperty('top', topPx, 'important');
            panel.style.setProperty('bottom', 'auto', 'important');
        }
        panel.style.setProperty('right', rightPx, 'important');
        panel.style.setProperty('left', 'auto', 'important');
    };

    const setPanelState = (isMinimized) => {
        isPanelMinimized = isMinimized;
        if (isMinimized) {
            panel.style.zIndex = PANEL_Z_INDEX_MINIMIZED;
            panel.style.display = 'none';
            expandedView.style.display = 'none';
            expandedView.classList.remove('gx-visible');
            expandedView.classList.add('gx-hidden');
            minimizedView.style.display = 'none';
            minimizedView.classList.remove('gx-visible');
            minimizedView.classList.add('gx-hidden');

        } else {
            // Capture current position while docked (before moving)
            const rect = panel.getBoundingClientRect();
            const currentTop = rect.top;
            const currentRight = window.innerWidth - rect.right;

            if (panel.parentElement && panel.parentElement.id === 'gemini-dock') {
                // Insert placeholder to prevent shift
                const placeholder = document.createElement('div');
                placeholder.id = 'gx-dock-placeholder';
                placeholder.style.cssText = 'width: 56px; height: 56px; margin: 0; padding: 0; display: block; flex-shrink: 0;';

                // Insert placeholder before moving panel
                panel.parentElement.insertBefore(placeholder, panel);

                // Move panel to body
                document.body.appendChild(panel);
            }

            // Clear strict docking styles and restore base panel styles
            panel.style.cssText = '';
            panel.style.cssText = `
                position: fixed;
                z-index: ${PANEL_Z_INDEX_EXPANDED};
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            `;

            // Apply dynamic position (align right shoulders)
            const topPx = (currentTop > 0) ? currentTop : (PANEL_MARGIN.expandedTop + 80);
            const rightPx = (currentRight >= 0) ? currentRight : PANEL_MARGIN.expandedRight;

            setPanelFixedPosition({
                topPx: `${topPx}px`,
                rightPx: `${rightPx}px`
            });
            panel.style.width = '300px';
            panel.style.display = 'block';
            minimizedView.style.display = 'none';
            minimizedView.classList.remove('gx-visible');
            minimizedView.classList.add('gx-hidden');
            expandedView.style.display = 'flex';
            requestAnimationFrame(() => {
                expandedView.classList.remove('gx-hidden');
                expandedView.classList.add('gx-visible');
            });
        }
    };

    // expose for keyboard shortcuts
    panelControl.togglePanel = () => setPanelState(!isPanelMinimized);
    panelControl.setPanelState = setPanelState;
    panelControl.getPanelState = () => isPanelMinimized;

    // Minimize Button Handler
    minimizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setPanelState(true);
    });

    // Restore Handler (Clicking the minimized icon)
    minimizedView.addEventListener('click', () => {
        setPanelState(false);
    });

    // Draggable Logic (Only active in Expanded mode for now)
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    const handleMouseDown = (e) => {
        if (isPanelMinimized) return; // Disallow dragging icon as it's fixed to top-right
        if (['BUTTON', 'INPUT', 'SELECT', 'LABEL'].includes(e.target.tagName)) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        panel.style.bottom = 'auto';
        panel.style.right = 'auto';
        panel.style.left = `${initialLeft}px`;
        panel.style.top = `${initialTop}px`;
        e.preventDefault();
    };

    header.addEventListener('mousedown', handleMouseDown);

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        panel.style.left = `${initialLeft + dx}px`;
        panel.style.top = `${initialTop + dy}px`;
    });

    document.addEventListener('mouseup', () => { isDragging = false; });

    // Meta (version/author) - Banana style
    try {
        if (chrome?.runtime?.getManifest) {
            const version = chrome.runtime.getManifest().version || '-';
            if (metaVersionEl) metaVersionEl.textContent = `バージョン ${version}`;
            if (metaAuthorEl && metaAuthorEl.tagName === 'A') {
                metaAuthorEl.textContent = 'Mojofull';
                metaAuthorEl.setAttribute('href', 'https://bit.ly/4shaBYM');
            }
        }
    } catch (e) {
        // ignore
    }

    // Toggle Style Update helper
    const updateToggleStyle = (checked) => {
        const slider = toggle.nextElementSibling;
        const accent = checked ? '#2ecc71' : '#cfd9de';
        if (checked) {
            slider.style.backgroundColor = '#2ecc71';
            knob.style.transform = 'translateX(20px)';
        } else {
            slider.style.backgroundColor = '#cfd9de';
            knob.style.transform = 'translateX(2px)';
        }

        // Keep border colors in sync (Banana-style)
        if (expandedView) expandedView.style.setProperty('--gx-accent', accent);
        if (minimizedButton) minimizedButton.style.setProperty('--gx-accent', accent);
        // Minimize button border remains Banana-like (neutral)

        // Minimized icon state (green when auto-translate is ON)
        if (minimizedButton) {
            if (checked) {
                minimizedButton.style.boxShadow = 'rgba(46, 204, 113, 0.25) 0px 0px 8px, rgba(46, 204, 113, 0.18) 0px 1px 3px 1px';
            } else {
                minimizedButton.style.boxShadow = 'rgba(101, 119, 134, 0.2) 0px 0px 8px, rgba(101, 119, 134, 0.25) 0px 1px 3px 1px';
            }
        }
    };

    const updateSaveDirty = () => {
        if (!saveBtn) return;
        const keyNow = (apiKeyInput?.value || '').trim();
        const modelNow = modelSelect?.value || DEFAULT_MODEL;
        const dirty = (keyNow !== (savedKeySnapshot || '')) || (modelNow !== (savedModelSnapshot || DEFAULT_MODEL));
        saveBtn.classList.toggle('gx-save--dirty', dirty);
    };

    // Focus effects for inputs
    const addFocusEffects = (el) => {
        if (!el) return;
        el.addEventListener('focus', () => el.style.border = '1px solid #1d9bf0');
        el.addEventListener('blur', () => el.style.border = '1px solid #cfd9de');
    };
    addFocusEffects(apiKeyInput);
    addFocusEffects(modelSelect);
    addFocusEffects(directionSelect);
    addFocusEffects(onboardKey);
    addFocusEffects(onboardModel);

    // Lightweight toast helper using existing message nodes
    const setMsg = (el, text, ok = true) => {
        el.textContent = text;
        el.style.color = ok ? '#00ba7c' : '#f4212e';
    };

    const testApiKey = async (key, model) => {
        // Use low-cost countTokens endpoint for a quick live check
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
        try {
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens?key=${key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
                signal: controller.signal
            });
            clearTimeout(timer);
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                if (resp.status === 403) throw new Error('キーが無効か権限がありません (403)');
                if (resp.status === 429) throw new Error('リクエスト上限に達しました (429)');
                throw new Error(err.error?.message || `HTTP ${resp.status}`);
            }
        } catch (e) {
            clearTimeout(timer);
            if (e.name === 'AbortError') throw new Error('キー確認がタイムアウトしました (5秒)');
            throw e;
        }
    };

    const humanizeKeyTestError = (err) => {
        const msg = String(err?.message || err || '');
        const m = msg.toLowerCase();
        if (!msg) return '確認に失敗しました。もう一度お試しください。';
        if (m.includes('403')) return 'このAPIキーでは利用できません。キーと権限を確認してください。';
        if (m.includes('429')) return '混み合っています。少し待ってからもう一度お試しください。';
        if (m.includes('timeout') || m.includes('5秒')) return '通信がタイムアウトしました。時間をおいて再試行してください。';
        return '確認に失敗しました。キーを確認して、もう一度お試しください。';
    };



    const showOnboarding = (prefillModel) => {
        // Prefill model choice and keep key empty to encourage fresh input
        onboardModel.value = prefillModel || DEFAULT_MODEL;
        onboardKey.value = '';
        onboardMsg.textContent = '';
        // Force expanded view to ensure visibility
        setPanelState(false);
        expandedView.style.display = 'flex';
        requestAnimationFrame(() => {
            onboard.style.display = 'block';
        });
    };
    triggerOnboarding = showOnboarding;

    const hideOnboarding = () => {
        onboard.style.display = 'none';
    };

    const resetTranslations = () => {
        if (scheduledTimerId) {
            clearTimeout(scheduledTimerId);
            scheduledTimerId = null;
        }
        translationQueue.length = 0;
        translationCache.clear();
        translationByTweetId.clear();
        originalTextCache.clear();
        expandedRetranslated.clear();
        const translatedEls = document.querySelectorAll('[data-testid="tweetText"][data-gemini-translated], div[lang][data-gemini-translated]');
        translatedEls.forEach((el) => {
            if (el.dataset.geminiOriginalHtml) {
                el.innerHTML = el.dataset.geminiOriginalHtml;
            }
            delete el.dataset.geminiTranslated;
            delete el.dataset.geminiTranslatedOriginal;
            delete el.dataset.geminiTranslatedText;
            delete el.dataset.geminiTranslatedMode;
            delete el.dataset.geminiOriginalHtml;
            delete el.dataset.geminiTranslatedTweetId;
            delete el.dataset.gemLabOwner;
        });
        const pageEls = document.querySelectorAll('[data-gx-page-translated]');
        pageEls.forEach((el) => {
            const original = el.dataset.gxOriginalText || el.textContent || '';
            const textNode = document.createTextNode(original);
            el.replaceWith(textNode);
        });
        if (isXHost) {
            scanExistingTweets();
        } else {
            scanPageContent({ force: true });
        }
    };

    // Load State from Storage
    chrome.storage.local.get([
        'isAutoTranslateEnabled',
        'geminiModel',
        'modelStats',
        MODEL_STATS_DAY_KEY,
        'geminiApiKey',
        'translationDirection',
        SETTINGS_EXCLUDE_KEYWORDS_KEY,
        SETTINGS_DAILY_COST_LIMIT_USD_KEY,
        SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY,
        SETTINGS_CACHE_ENABLED_KEY,
        SETTINGS_GLOSSARY_KEY,
        SETTINGS_SITE_WHITELIST_KEY,
        SETTINGS_SITE_MODE_KEY,
        SETTINGS_SITE_RULES_KEY,
        SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY,
        SETTINGS_TRANSLATE_COLOR_RULES_KEY,
        MODEL_MIGRATION_KEY
    ], (res) => {
        // Toggle
        const isEnabled = res.isAutoTranslateEnabled !== false;
        toggle.checked = isEnabled && !!res.geminiApiKey;
        updateToggleStyle(toggle.checked);

        // Stats (Use modelStats now)
        let currentModel = res.geminiModel || DEFAULT_MODEL;
        if (!res[MODEL_MIGRATION_KEY]) {
            currentModel = DEFAULT_MODEL;
            chrome.storage.local.set({
                geminiModel: DEFAULT_MODEL,
                [MODEL_MIGRATION_KEY]: true
            });
        }
        const dayKey = getModelStatsDayKey();
        let modelStats = res.modelStats || {};
        if (res[MODEL_STATS_DAY_KEY] !== dayKey) {
            modelStats = {};
            chrome.storage.local.set({ modelStats: {}, [MODEL_STATS_DAY_KEY]: dayKey });
        }
        updateStatsUI(modelStats, currentModel);

        // Settings
        modelSelect.value = currentModel;
        directionSelect.value = res.translationDirection || DIR_EN_JA;
        if (res.geminiApiKey) apiKeyInput.value = res.geminiApiKey;
        cachedApiKey = (res.geminiApiKey || '').trim();
        savedKeySnapshot = cachedApiKey;
        savedModelSnapshot = currentModel;
        translationDirection = res.translationDirection || DIR_EN_JA;

        const keywords = (res[SETTINGS_EXCLUDE_KEYWORDS_KEY] || [])
            .map((s) => String(s || '').trim().toLowerCase())
            .filter(Boolean);
        excludedKeywords = keywords;

        dailyCostLimitUsd = typeof res[SETTINGS_DAILY_COST_LIMIT_USD_KEY] === 'number' ? res[SETTINGS_DAILY_COST_LIMIT_USD_KEY] : null;
        dailyTotalCharsLimit = typeof res[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY] === 'number' ? res[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY] : null;

        isTranslationCacheEnabled = res[SETTINGS_CACHE_ENABLED_KEY] !== false;
        if (!isTranslationCacheEnabled) translationCache.clear();

        const gp = Array.isArray(res[SETTINGS_GLOSSARY_KEY]) ? res[SETTINGS_GLOSSARY_KEY] : [];
        glossaryPairs = gp
            .map((p) => ({ from: String(p?.from || '').trim(), to: String(p?.to || '').trim() }))
            .filter((p) => p.from && p.to)
            .slice(0, 30);

        siteWhitelist = Array.isArray(res[SETTINGS_SITE_WHITELIST_KEY])
            ? res[SETTINGS_SITE_WHITELIST_KEY].map(normalizeHost).filter(Boolean)
            : [];
        siteMode = res[SETTINGS_SITE_MODE_KEY] === 'advanced' ? 'advanced' : 'simple';
        siteRules = normalizeSiteRules(res[SETTINGS_SITE_RULES_KEY]);
        refreshSpaScanEnabled(currentHost);
        translateColorDefault = normalizeColorName(res[SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY]) || 'inherit';
        translateColorRules = normalizeColorRules(res[SETTINGS_TRANSLATE_COLOR_RULES_KEY]);
        isSiteAllowed = isHostAllowed(currentHost);
        pageTranslationEnabled = isSiteAllowed && !!getPageTranslationConfig();

        // Default to minimized on load (top-right, shifted left)
        setPanelState(true);

        updateSaveDirty();

        // If no API key yet, guide user with inline onboarding
        if (!res.geminiApiKey) {
            showOnboarding(currentModel);
        }

        // Initial scan after storage is loaded (ensures toggle state is correct)
        loadPageCache(() => {
        if (toggle.checked && isSiteAllowed) {
            scanPageContent({ force: false });
        }
    });
    });

    // Event Listeners
    toggle.addEventListener('change', (e) => {
        const checked = e.target.checked;
        updateToggleStyle(checked);
        chrome.storage.local.set({ isAutoTranslateEnabled: checked });
        if (checked) {
            scanPageContent({ force: false });
            processQueue();
        } else {
            resetTranslations();
        }
    });

    translateOnceBtn?.addEventListener('click', () => {
        scanPageContent({ force: true });
        processQueue({ force: true });
    });

    resetBtn?.addEventListener('click', () => {
        resetTranslations();
        showToast('元に戻しました', 'success');
    });

    directionSelect?.addEventListener('change', (e) => {
        const dir = e.target.value === DIR_JA_EN ? DIR_JA_EN : DIR_EN_JA;
        translationDirection = dir;
        chrome.storage.local.set({ translationDirection: dir });
        resetTranslations();
        if (toggle.checked) {
            scanPageContent({ force: false });
            processQueue();
        }
    });

    openOptionsBtn?.addEventListener('click', () => {
        if (!isRuntimeAvailable()) {
            showToast('設定ページを開けませんでした。拡張機能を再読み込みしてください。', 'error', 4000);
            return;
        }
        try {
            chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE' }, (res) => {
                const lastErr = chrome.runtime.lastError;
                if (lastErr) {
                    showToast('設定ページを開けませんでした。拡張機能を再読み込みしてください。', 'error', 4000);
                    return;
                }
                if (!res?.success) showToast('設定ページを開けませんでした。拡張機能を再読み込みしてください。', 'error', 4000);
            });
        } catch (e) {
            showToast('設定ページを開けませんでした。拡張機能を再読み込みしてください。', 'error', 4000);
        }
    });

    modelSelect.addEventListener('change', (e) => {
        const newModel = e.target.value;
        // Update stats display immediately when model changes
        chrome.storage.local.get(['modelStats'], (r) => {
            updateStatsUI(r.modelStats || {}, newModel);
        });
        updateSaveDirty();
    });

    apiKeyInput?.addEventListener('input', updateSaveDirty);

    const setSettingsExpanded = (expanded) => {
        const next = !!expanded;
        settingsContent.style.display = next ? 'block' : 'none';
        settingsToggle.setAttribute('aria-expanded', next ? 'true' : 'false');
        if (settingsChevron) settingsChevron.style.transform = `rotate(${next ? 180 : 0}deg)`;
    };

    // Ensure initial chevron state matches initial display
    try {
        setSettingsExpanded(settingsContent.style.display !== 'none');
    } catch (e) {
        // ignore
    }

    settingsToggle.addEventListener('click', () => {
        const isHidden = settingsContent.style.display === 'none';
        setSettingsExpanded(isHidden);
    });



    saveBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        const model = modelSelect.value;
        if (!validateApiKey(key)) {
            setMsg(msgEl, 'APIキーの形式が正しくありません', false);
            return;
        }
        saveBtn.textContent = '保存中...';
        setMsg(msgEl, 'キー確認中...', true);

        testApiKey(key, model).then(() => {
            chrome.storage.local.set({
                geminiApiKey: key,
                geminiModel: model
            }, () => {
                cachedApiKey = key;
                savedKeySnapshot = key;
                savedModelSnapshot = model;
                updateSaveDirty();
                saveBtn.textContent = '保存';
                setMsg(msgEl, '設定を保存しました', true);
                // Force stats update
                chrome.storage.local.get(['modelStats'], (r) => {
                    updateStatsUI(r.modelStats || {}, model);
                });
                setTimeout(() => { msgEl.textContent = ''; }, 2000);
            });
        }).catch((err) => {
            saveBtn.textContent = '保存';
            setMsg(msgEl, humanizeKeyTestError(err), false);
        });
    });

    onboardSave.addEventListener('click', () => {
        const key = onboardKey.value.trim();
        const model = onboardModel.value;
        if (!key) {
            setMsg(onboardMsg, 'APIキーを入力してください', false);
            return;
        }
        if (!validateApiKey(key)) {
            setMsg(onboardMsg, 'APIキーの形式が正しくありません', false);
            return;
        }
        onboardSave.textContent = '保存中...';
        setMsg(onboardMsg, 'キー確認中...', true);

        testApiKey(key, model).then(() => {
            chrome.storage.local.set({
                geminiApiKey: key,
                geminiModel: model,
                isAutoTranslateEnabled: true
            }, () => {
                cachedApiKey = key;
                apiKeyInput.value = key;
                modelSelect.value = model;
                toggle.checked = true;
                updateToggleStyle(true);
                setMsg(onboardMsg, '設定を保存しました', true);
                setTimeout(() => {
                    onboardSave.textContent = '保存して開始';
                    hideOnboarding();
                    scanExistingTweets();
                    processQueue();
                }, 600);
            });
        }).catch((err) => {
            onboardSave.textContent = '保存して開始';
            setMsg(onboardMsg, humanizeKeyTestError(err), false);
        });
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.modelStats) {
            chrome.storage.local.get(['modelStats', 'geminiModel'], (r) => {
                updateStatsUI(r.modelStats || {}, r.geminiModel || DEFAULT_MODEL);
            });
        }
        if (changes.geminiApiKey) {
            cachedApiKey = (changes.geminiApiKey.newValue || '').trim();
            savedKeySnapshot = cachedApiKey;
            updateSaveDirty();
        }
        if (changes.geminiModel) {
            savedModelSnapshot = changes.geminiModel.newValue || DEFAULT_MODEL;
            updateSaveDirty();
        }
        if (changes.isAutoTranslateEnabled && toggle) {
            const enabled = changes.isAutoTranslateEnabled.newValue !== false;
            const canRun = enabled && !!cachedApiKey;
            toggle.checked = canRun;
            updateToggleStyle(canRun);
            if (canRun) {
                scanPageContent({ force: false });
                processQueue();
            }
        }
        if (changes.translationDirection) {
            translationDirection = changes.translationDirection.newValue || DIR_EN_JA;
            if (directionSelect) directionSelect.value = translationDirection;
        }
        if (changes[SETTINGS_EXCLUDE_KEYWORDS_KEY]) {
            const keywords = (changes[SETTINGS_EXCLUDE_KEYWORDS_KEY].newValue || [])
                .map((s) => String(s || '').trim().toLowerCase())
                .filter(Boolean);
            excludedKeywords = keywords;
        }
        if (changes[SETTINGS_DAILY_COST_LIMIT_USD_KEY]) {
            dailyCostLimitUsd = typeof changes[SETTINGS_DAILY_COST_LIMIT_USD_KEY].newValue === 'number' ? changes[SETTINGS_DAILY_COST_LIMIT_USD_KEY].newValue : null;
        }
        if (changes[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY]) {
            dailyTotalCharsLimit = typeof changes[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY].newValue === 'number' ? changes[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY].newValue : null;
        }
        if (changes[SETTINGS_CACHE_ENABLED_KEY]) {
            isTranslationCacheEnabled = changes[SETTINGS_CACHE_ENABLED_KEY].newValue !== false;
            if (!isTranslationCacheEnabled) translationCache.clear();
        }
        if (changes[SETTINGS_GLOSSARY_KEY]) {
            const gp = Array.isArray(changes[SETTINGS_GLOSSARY_KEY].newValue) ? changes[SETTINGS_GLOSSARY_KEY].newValue : [];
            glossaryPairs = gp
                .map((p) => ({ from: String(p?.from || '').trim(), to: String(p?.to || '').trim() }))
                .filter((p) => p.from && p.to)
                .slice(0, 30);
        }
        if (changes[SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY]) {
            translateColorDefault = normalizeColorName(changes[SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY].newValue) || 'inherit';
            refreshTranslatedColors();
        }
        if (changes[SETTINGS_TRANSLATE_COLOR_RULES_KEY]) {
            translateColorRules = normalizeColorRules(changes[SETTINGS_TRANSLATE_COLOR_RULES_KEY].newValue);
            refreshTranslatedColors();
        }
        if (changes[SETTINGS_SITE_RULES_KEY]) {
            siteRules = normalizeSiteRules(changes[SETTINGS_SITE_RULES_KEY].newValue);
            refreshSpaScanEnabled(currentHost);
        }

    });

    // Keep daily cost reset (4:00 local) fresh even if no API calls happen.
    setInterval(() => {
        try {
            maybeResetModelStatsAt4am();
        } catch (e) {
            // ignore
        }
    }, 5 * 60 * 1000);

    function updateStatsUI(modelStats, modelId) {
        // Get stats for specific model, default to 0
        const stats = modelStats[modelId] || { input: 0, output: 0 };
        const inChars = stats.input;
        const outChars = stats.output;

        inputCharsEl.textContent = inChars.toLocaleString();
        outputCharsEl.textContent = outChars.toLocaleString();

        const prices = PRICING[modelId] || PRICING['default'];
        const inCost = (inChars / CHARS_PER_TOKEN / 1000000) * prices.input;
        const outCost = (outChars / CHARS_PER_TOKEN / 1000000) * prices.output;

        costEl.textContent = '$' + (inCost + outCost).toFixed(5);

        const totalCost = estimateTotalCostUsd(modelStats);
        const totalChars = sumTotalChars(modelStats);
        const limitParts = [];
        if (typeof dailyCostLimitUsd === 'number' && dailyCostLimitUsd > 0) {
            limitParts.push(`上限 $${dailyCostLimitUsd}`);
        }
        if (typeof dailyTotalCharsLimit === 'number' && dailyTotalCharsLimit > 0) {
            limitParts.push(`上限 ${dailyTotalCharsLimit.toLocaleString()} chars`);
        }
        totalUsageEl.textContent =
            `合計: $${totalCost.toFixed(4)} / ${totalChars.toLocaleString()} chars` +
            (limitParts.length ? `（${limitParts.join(' / ')}）` : '');
    }
}

