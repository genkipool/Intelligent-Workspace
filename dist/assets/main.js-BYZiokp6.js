(function(){window.addEventListener(`message`,e=>{e.data&&e.data.action===`pauseMedia`&&(document.querySelectorAll(`video, audio`).forEach(e=>{try{e.paused||e.pause()}catch{}}),document.querySelectorAll(`iframe`).forEach(e=>{try{e.contentWindow&&e.contentWindow.postMessage({action:`pauseMedia`},`*`)}catch{}}))});var e=class{constructor(){this.insertMode=!1,this.hintsGloballyEnabled=!0,this.keySequence=``,this.keyTimeout=null,this.shadowUI=new ShadowUI,this.scrollManager=new ScrollManager,this.hintEngine=new HintEngine(this.shadowUI),this.omniBar=new OmniBar,this.snippetManager=new SnippetManager(this.shadowUI),this.commands=new CommandRegistry(this.scrollManager,this.hintEngine,this.omniBar,null,this.shadowUI),this.linkPreviewManager=new LinkPreviewManager(this.shadowUI),this.helpModal=new HelpModal(this.shadowUI,this.commands,this.snippetManager,this.linkPreviewManager),this.commands.setHelpModal(this.helpModal),this._ytPipObserver=null}async init(){let e=window.name===`itg-video-pip-iframe`||new URLSearchParams(window.location.search).get(`itg_video_pip`)===`true`||window.location.href.includes(`itg_video_pip=true`),t=window.name===`itg-page-pip-iframe`||window.name===`itg-pip-iframe`||new URLSearchParams(window.location.search).get(`itg_pip`)===`true`||window.location.href.includes(`itg_pip=true`),n=e||t;if(!n){this.shadowUI.init(),chrome.storage.local.get([`globalPageMode`,`activeTheme`],e=>{e.globalPageMode&&document.documentElement.setAttribute(`itg-global-mode`,e.globalPageMode),e.activeTheme&&this.shadowUI.applyTheme(e.activeTheme)});let e=await chrome.storage.sync.get([`hintsEnabled`]);this.hintsGloballyEnabled=e.hintsEnabled!==!1,await this.commands.loadUserCommands(),this.hintEngine.updateHintChars(this.commands.getMappings()),Utils.isInputLikeElement(document.activeElement)&&(this.insertMode=!0),this._attachListeners(),this.linkPreviewManager.init();let t=()=>{document.querySelector(`video`)&&window.parent&&window!==window.parent&&window.parent.postMessage({action:`ITG_PREVIEW_HAS_VIDEO`},`*`)};this._videoCheckInterval=setInterval(t,1e3),t(),this._injectYoutubePipButton(),this._injectTiktokPipButton()}if(e){document.documentElement.style.overflow=`hidden`,document.body&&(document.body.style.overflow=`hidden`,document.body.style.backgroundColor=`#000`);let e=document.createElement(`style`);e.textContent=`
                    video::-webkit-media-controls,
                    video::-webkit-media-controls-enclosure,
                    video::-webkit-media-controls-panel,
                    video::-webkit-media-controls-timeline,
                    video::-webkit-media-controls-current-time-display,
                    video::-webkit-media-controls-time-remaining-display,
                    video::-webkit-media-controls-play-button,
                    video::-webkit-media-controls-mute-button,
                    video::-webkit-media-controls-volume-slider,
                    video::-webkit-media-controls-fullscreen-button {
                        transition: opacity 0.3s ease-in-out !important;
                        pointer-events: auto !important;
                        cursor: pointer !important;
                    }
                    video[itg-hover="true"]::-webkit-media-controls,
                    video[itg-hover="true"]::-webkit-media-controls-enclosure,
                    video[itg-hover="true"]::-webkit-media-controls-panel {
                        display: flex !important;
                        opacity: 1 !important;
                        visibility: visible !important;
                        pointer-events: auto !important;
                    }
                    video[itg-hover="false"]::-webkit-media-controls,
                    video[itg-hover="false"]::-webkit-media-controls-enclosure,
                    video[itg-hover="false"]::-webkit-media-controls-panel {
                        opacity: 0 !important;
                        pointer-events: none !important;
                    }
                `,document.head.appendChild(e);let t=0,n=!1,r=null,i=(e,t=0)=>{if(console.log(`[ITG PiP Debug] executeMaximize triggered on video:`,e,`with delay: ${t}ms`),n){console.log(`[ITG PiP Debug] executeMaximize: already resolved, returning`);return}n=!0,r&&=(console.log(`[ITG PiP Debug] executeMaximize: clearing polling interval`),clearInterval(r),null),t>0?setTimeout(()=>{console.log(`[ITG PiP Debug] executeMaximize: calling _maximizeVideoForPip after delay`),this._maximizeVideoForPip(e)},t):(console.log(`[ITG PiP Debug] executeMaximize: calling _maximizeVideoForPip immediately`),this._maximizeVideoForPip(e))},a=()=>{let e=Array.from(document.querySelectorAll(`video`));return e.length===0?null:e.length===1?e[0]:e.find(e=>!e.paused&&e.currentTime>0)||e.find(e=>{let t=e.closest(`ytd-player`);return t?t.getAttribute(`aria-hidden`)!==`true`&&t.style.visibility!==`hidden`:!1})||e.find(e=>{let t=e.getBoundingClientRect();return t.width>0&&t.height>0})||e[0]},o=()=>{if(window.location.hostname.includes(`youtube.com`))return;let e=a();if(!e)return;let t=()=>{document.readyState===`complete`&&(e.duration===1/0||document.querySelector(`.ytp-live`)||i(e,1e3))};e.addEventListener(`canplay`,t),e.addEventListener(`playing`,t),window.addEventListener(`load`,t),e.readyState>=3&&e.currentTime>0&&document.readyState===`complete`&&t()};o();let s=null,c=null;r=setInterval(()=>{if(n){r&&clearInterval(r);return}if(document.readyState!==`complete`)return;s||(s=Date.now(),console.log(`[ITG PiP Debug] Polling loop started. pipStartTime initialized.`)),t++;let e=a();if(!e||!document.body){console.log(`[ITG PiP Debug] Polling tick ${t}: No video element or document.body found.`),o();return}let l=e.duration===1/0||!!document.querySelector(`.ytp-live`),u=window.location.pathname.includes(`/shorts/`)||!!document.querySelector(`ytd-shorts`),d;if(l){let t=e.readyState>=3&&e.currentTime>0&&!e.paused,n=Date.now()-s,r=!1;if(n>=2e3){let e=document.querySelector(`#chat, ytd-live-chat-frame`);if(!e)r=!0;else{let t=e.querySelector(`iframe`);if(!t)r=!1;else try{let e=t.contentDocument||t.contentWindow?.document;r=e&&e.readyState===`complete`&&e.body&&e.body.children.length>0}catch{r=!!t.src&&t.src!==`about:blank`}}}d=t&&r}else if(u){let n=e.readyState>=2||e.currentTime>0&&!e.paused,r=document.querySelector(`ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]`),i=document.querySelector(`ytd-masthead`),a=!1,o=!1;if(!i||!r)d=!1;else{if(r.getAttribute(`visibility`)===`ENGAGEMENT_PANEL_VISIBILITY_EXPANDED`){console.log(`[ITG PiP Debug] Comments panel expanded, clicking close button.`);let e=r.querySelector(`#close-button, yt-icon-button, button`);e&&e.click()}a=r.getAttribute(`visibility`)!==`ENGAGEMENT_PANEL_VISIBILITY_EXPANDED`||r.offsetWidth===0||r.getBoundingClientRect().width===0,o=i.classList.contains(`masthead-finish`),d=n&&a&&o}if(console.log(`[ITG PiP Debug] Polling tick ${t} | VideoPlaying: ${n} | Masthead: ${!!i} (ready: ${o}) | CommentsPanel: ${!!r} (hidden: ${a}) | isReady: ${d} | ReadyTime: ${c?Date.now()-c+`ms ago`:`Not started`}`),d){if(c||(c=Date.now(),console.log(`[ITG PiP Debug] Conditions met. Starting 2-second stability delay.`)),Date.now()-c<2e3)return}else{c&&console.log(`[ITG PiP Debug] Conditions broken. Resetting stability delay.`),c=null;return}}else d=e.readyState>=2||e.currentTime>0&&!e.paused;let f=l?60:u?100:16;if(console.log(`[ITG PiP Debug] Evaluating triggers. Attempt: ${t}/${f} | isReady: ${d}`),!d&&t<f||n)return;if(u&&(!document.querySelector(`ytd-masthead`)||!document.querySelector(`ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]`))){console.log(`[ITG PiP Debug] Timeout reached but ytd-masthead or commentsPanel still missing in DOM. Waiting...`);return}let p=l||u?0:1e3;console.log(`[ITG PiP Debug] Proceeding to maximize. Delay: ${p}ms`),i(e,p)},150),this._findVideoInterval=r,setTimeout(()=>{if(!n){let e=a();if(e){let t=window.location.pathname.includes(`/shorts/`);console.log(`[ITG PiP Debug] 15s safety fallback triggered. isShort: ${t}`),(!t||document.querySelector(`ytd-masthead`)&&document.querySelector(`ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]`))&&i(e,0)}}},15e3)}n||(this._boundMessageHandler=e=>{e.action===`updateHintStatus`&&(this.hintsGloballyEnabled=e.enabled),e.action===`linkPreviewStatusChanged`&&(this.linkPreviewManager&&this.linkPreviewManager.setEnabled(e.enabled),this.helpModal&&this.helpModal.updateLinkPreviewToggle(e.enabled)),e.action===`linkPreviewBlacklistUpdated`&&(this.linkPreviewManager&&this.linkPreviewManager.setBlacklist(e.blacklist),this.helpModal&&this.helpModal.updateLinkPreviewBlacklist(e.blacklist)),e.action===`linkPreviewTriggerKeyUpdated`&&(this.linkPreviewManager&&this.linkPreviewManager.setTriggerKey(e.triggerKey),this.helpModal&&this.helpModal.updateLinkPreviewTriggerKey(e.triggerKey)),e.action===`hintCommandsUpdated`&&(async()=>{await this.commands.loadUserCommands(),this.hintEngine.updateHintChars(this.commands.getMappings())})(),e.action===`themeChanged`&&(e.theme?this.shadowUI.applyTheme(e.theme):chrome.storage.local.get([`activeTheme`],e=>{e.activeTheme&&this.shadowUI.applyTheme(e.activeTheme)}))},chrome.runtime.onMessage.addListener(this._boundMessageHandler));let r=e=>{if(!e)return!1;try{return e.name===`itg-page-pip-iframe`||e.name===`itg-pip-iframe`||e.location&&e.location.search&&new URLSearchParams(e.location.search).get(`itg_pip`)===`true`||e.location&&e.location.href&&e.location.href.includes(`itg_pip=true`)}catch{try{return e.name===`itg-page-pip-iframe`||e.name===`itg-pip-iframe`}catch{return!1}}};(r(window)||window.parent&&r(window.parent))&&(window.parent&&r(window.parent)&&window!==window.parent?document.addEventListener(`click`,e=>{e.composedPath().find(e=>e&&(e.id===`close-button`||e.getAttribute&&(e.getAttribute(`aria-label`)===`Cerrar`||e.getAttribute(`aria-label`)===`Close`)))&&(console.log(`[ITG PiP] Close button clicked inside sub-frame. Sending ITG_CLOSE_CHAT message to parent.`),window.parent.postMessage({action:`ITG_CLOSE_CHAT`},`*`),e.preventDefault(),e.stopPropagation())},!0):(window.addEventListener(`message`,e=>{if(e.data&&e.data.action===`ITG_CLOSE_CHAT`){console.log(`[ITG PiP] Received ITG_CLOSE_CHAT message. Closing chat panel.`);let e=document.querySelector(`#show-hide-button button, ytd-live-chat-frame #show-hide-button, #chat-container #show-hide-button`);if(e)try{e.click()}catch{}document.querySelectorAll(`#chat, #chat-container, ytd-live-chat-frame, #chatframe`).forEach(e=>{try{e.style.setProperty(`display`,`none`,`important`)}catch{}})}}),document.addEventListener(`click`,e=>{let t=e.composedPath().find(e=>e&&e.closest&&(e.id===`close-button`&&e.closest(`ytd-engagement-panel-section-list-renderer`)||e.getAttribute&&(e.getAttribute(`aria-label`)===`Cerrar`||e.getAttribute(`aria-label`)===`Close`)&&e.closest(`ytd-engagement-panel-section-list-renderer`)));if(t){console.log(`[ITG PiP] Comments close button clicked on main page. Hiding engagement panel.`),e.preventDefault(),e.stopPropagation();let n=t.closest(`ytd-engagement-panel-section-list-renderer`);if(n){try{n.setAttribute(`visibility`,`ENGAGEMENT_PANEL_VISIBILITY_HIDDEN`)}catch{}try{n.style.setProperty(`display`,`none`,`important`)}catch{}}}},!0)))}_maximizeVideoForPip(e){try{if(window.location.hostname.includes(`youtube.com`)){if(window.location.pathname.includes(`/shorts/`)||document.querySelector(`ytd-shorts`)){this._maximizeShortsForPip(e);return}let t=e.closest(`#movie_player, .html5-video-player, ytd-player, #player`)||document.querySelector(`#movie_player, .html5-video-player, ytd-player, #player`)||e,n=document.createElement(`style`);n.textContent=`
                                #chat, #chat-container, ytd-live-chat-frame,
                                yt-live-chat-renderer, #chatframe {
                                    display: none !important;
                                    width: 0 !important;
                                    height: 0 !important;
                                    visibility: hidden !important;
                                    pointer-events: none !important;
                                }
                            `,document.head.appendChild(n);let r=`#chat, #chat-container, ytd-live-chat-frame, #chatframe`;document.querySelectorAll(r).forEach(e=>{try{e.remove()}catch{}}),new MutationObserver(e=>{for(let t of e)for(let e of t.addedNodes)if(e.nodeType===1){if(e.matches&&e.matches(r))try{e.remove()}catch{}(e.querySelectorAll?e.querySelectorAll(r):[]).forEach(e=>{try{e.remove()}catch{}})}}).observe(document.documentElement,{childList:!0,subtree:!0}),document.body.appendChild(t),t.style.position=`fixed`,t.style.top=`0`,t.style.left=`0`,t.style.width=`100vw`,t.style.height=`100vh`,t.style.zIndex=`2147483647`,t.style.backgroundColor=`#000`,t.style.margin=`0`,t.style.padding=`0`,t.style.pointerEvents=`auto`,e.style.width=`100%`,e.style.height=`100%`,e.style.left=`0`,e.style.top=`0`,e.style.pointerEvents=`auto`,Array.from(document.body.children).forEach(e=>{e!==t&&e.tagName!==`SCRIPT`&&e.tagName!==`STYLE`&&(e.style.display=`none`)}),setTimeout(()=>{window.dispatchEvent(new Event(`resize`))},200),setTimeout(()=>{window.dispatchEvent(new Event(`resize`))},800)}else{document.body.appendChild(e),e.style.position=`fixed`,e.style.top=`0`,e.style.left=`0`,e.style.width=`100vw`,e.style.height=`100vh`,e.style.zIndex=`2147483647`,e.style.backgroundColor=`#000`,e.style.objectFit=`contain`,e.style.margin=`0`,e.style.padding=`0`,e.style.pointerEvents=`auto`,e.controls=!0,e.setAttribute(`itg-hover`,`true`);let t,n=()=>{try{document.activeElement!==e&&e.focus()}catch{}e.setAttribute(`itg-hover`,`true`),clearTimeout(t),t=setTimeout(()=>{e.paused||e.setAttribute(`itg-hover`,`false`)},2500)};window.addEventListener(`mousemove`,n,!0),e.addEventListener(`mousemove`,n,!0),e.addEventListener(`play`,n,!0),e.addEventListener(`pause`,n,!0),window.location.hostname.includes(`youtube.com`)||e.addEventListener(`click`,t=>{let n=e.getBoundingClientRect();t.clientY-n.top<n.height*.8&&(e.paused?e.play():e.pause())}),e.play().catch(e=>console.log(`Autoplay bloqueado por el navegador`)),Array.from(document.body.children).forEach(t=>{t!==e&&t.tagName!==`SCRIPT`&&t.tagName!==`STYLE`&&(t.style.display=`none`)})}}catch(e){console.warn(`Error maximizing video in PiP:`,e)}}_maximizeShortsForPip(e){console.log(`[ITG PiP Debug] _maximizeShortsForPip called with video:`,e);try{if(document.body.classList.contains(`itg-pip-shorts`)){console.log(`[ITG PiP Debug] _maximizeShortsForPip: already has itg-pip-shorts class, returning`);return}if(document.body.classList.add(`itg-hide-masthead`),!document.getElementById(`itg-pip-shorts-styles`)){let e=document.createElement(`style`);e.id=`itg-pip-shorts-styles`,e.textContent=`
                        /* 1. Hide header, guide sidebar, and panels immediately */
                        body.itg-hide-masthead ytd-masthead,
                        body.itg-hide-masthead #masthead-container,
                        body.itg-hide-masthead ytd-mini-guide-renderer,
                        body.itg-hide-masthead ytd-guide-renderer,
                        body.itg-hide-masthead #guide,
                        body.itg-pip-shorts ytd-engagement-panel-section-list-renderer,
                        body.itg-pip-shorts #watch-metadata,
                        body.itg-pip-shorts #panels {
                            display: none !important;
                            opacity: 0 !important;
                            visibility: hidden !important;
                            height: 0 !important;
                            width: 0 !important;
                        }

                        /* 2. Full-screen layout styles */
                        body.itg-pip-shorts,
                        body.itg-pip-shorts ytd-app,
                        body.itg-pip-shorts #content,
                        body.itg-pip-shorts #page-manager,
                        body.itg-pip-shorts ytd-shorts,
                        body.itg-pip-shorts #shorts-container {
                            background-color: #000 !important;
                            background: #000 !important;
                        }

                        body.itg-pip-shorts ytd-page-manager,
                        body.itg-pip-shorts ytd-app,
                        body.itg-pip-shorts #content,
                        body.itg-pip-shorts #page-manager {
                            margin: 0 !important;
                            padding: 0 !important;
                            width: 100vw !important;
                            height: 100vh !important;
                        }

                        body.itg-pip-shorts ytd-shorts,
                        body.itg-pip-shorts #shorts-container {
                            width: 100vw !important;
                            height: 100vh !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            overflow-y: scroll !important;
                            scrollbar-width: none !important;
                        }
                        body.itg-pip-shorts ytd-shorts::-webkit-scrollbar,
                        body.itg-pip-shorts #shorts-container::-webkit-scrollbar {
                            display: none !important;
                        }

                        body.itg-pip-shorts .reel-video-in-sequence-new {
                            margin: 0 auto !important;
                        }

                        /* Force horizontal centering of player and video tag to override YouTube's inline offsets */
                        body.itg-pip-shorts .video-stream.html5-main-video,
                        body.itg-pip-shorts .html5-video-player,
                        body.itg-pip-shorts ytd-player,
                        body.itg-pip-shorts #player-container {
                            left: 0 !important;
                            right: 0 !important;
                            margin: 0 auto !important;
                        }

                        body.itg-pip-shorts #cinematic-container,
                        body.itg-pip-shorts .cinematic-container,
                        body.itg-pip-shorts #cinematic-shorts-scrim,
                        body.itg-pip-shorts .pip-blur-filter,
                        body.itg-pip-shorts .reel-video-in-sequence-thumbnail {
                            display: none !important;
                            opacity: 0 !important;
                            visibility: hidden !important;
                        }

                        body.itg-pip-shorts ytd-reel-player-overlay-renderer,
                        body.itg-pip-shorts .player-controls,
                        body.itg-pip-shorts #scrubber {
                            opacity: 0 !important;
                            transition: opacity 0.25s ease !important;
                            pointer-events: none !important;
                        }

                        body.itg-pip-shorts .reel-video-in-sequence-new:hover ytd-reel-player-overlay-renderer,
                        body.itg-pip-shorts .reel-video-in-sequence-new:hover .player-controls,
                        body.itg-pip-shorts .reel-video-in-sequence-new:hover #scrubber {
                            opacity: 1 !important;
                            pointer-events: auto !important;
                        }
                    `,document.head.appendChild(e)}(()=>{console.log(`[ITG PiP Debug] proceedToFullscreen: adding itg-pip-shorts to body`),document.body.classList.add(`itg-pip-shorts`);let t=e.closest(`.reel-video-in-sequence-new`);t?(console.log(`[ITG PiP Debug] proceedToFullscreen: scrolling active card into view`),t.scrollIntoView({behavior:`auto`,block:`start`})):console.log(`[ITG PiP Debug] proceedToFullscreen: active card container NOT found`),console.log(`[ITG PiP Debug] proceedToFullscreen: dispatching progressive resize events`),window.dispatchEvent(new Event(`resize`)),setTimeout(()=>window.dispatchEvent(new Event(`resize`)),50),setTimeout(()=>window.dispatchEvent(new Event(`resize`)),150),setTimeout(()=>window.dispatchEvent(new Event(`resize`)),400),setTimeout(()=>window.dispatchEvent(new Event(`resize`)),1e3)})();let t=e=>{if(e.loop&&=!1,e.hasAttribute(`loop`)&&e.removeAttribute(`loop`),e.hasAttribute(`itg-auto-advance-setup`))return;e.setAttribute(`itg-auto-advance-setup`,`true`);let t=()=>{let t=e.closest(`.reel-video-in-sequence-new`),n=!1;if(t){let e=t.nextElementSibling;e&&e.classList.contains(`reel-video-in-sequence-new`)&&(e.scrollIntoView({behavior:`smooth`,block:`start`}),n=!0)}if(!n){let e=document.getElementById(`shorts-container`)||document.querySelector(`ytd-shorts`);e&&e.scrollBy({top:e.clientHeight||window.innerHeight,behavior:`smooth`})}};e.addEventListener(`ended`,t),e.addEventListener(`timeupdate`,()=>{e.loop&&=!1,e.hasAttribute(`loop`)&&e.removeAttribute(`loop`),e.duration&&e.currentTime&&e.duration-e.currentTime<.25&&(e.hasAttribute(`itg-transitioning`)||(e.setAttribute(`itg-transitioning`,`true`),t(),setTimeout(()=>{e.removeAttribute(`itg-transitioning`)},2e3)))})};t(e);let n=()=>{let e=Array.from(document.querySelectorAll(`video`));return e.length===0?null:e.length===1?e[0]:e.find(e=>!e.paused&&e.currentTime>0)||e.find(e=>{let t=e.closest(`ytd-player`);return t?t.getAttribute(`aria-hidden`)!==`true`&&t.style.visibility!==`hidden`:!1})||e.find(e=>{let t=e.getBoundingClientRect();return t.width>0&&t.height>0})||e[0]};this._shortsCheckInterval=setInterval(()=>{let e=n();e&&t(e)},500)}catch(e){console.warn(`Error in _maximizeShortsForPip:`,e)}}_attachListeners(){this._boundFocusInHandler=e=>{if(!chrome.runtime||!chrome.runtime.id){this.cleanup();return}Utils.isInputLikeElement(e.target)&&(this.insertMode=!0)},this._boundFocusOutHandler=e=>{if(!chrome.runtime||!chrome.runtime.id){this.cleanup();return}Utils.isInputLikeElement(e.target)&&(this.insertMode=!1)},this._boundMainKeyDownHandler=e=>this._handleKeyDown(e),document.addEventListener(`focusin`,this._boundFocusInHandler),document.addEventListener(`focusout`,this._boundFocusOutHandler),document.addEventListener(`keydown`,this._boundMainKeyDownHandler,!0)}_injectYoutubePipButton(){if(!window.location.hostname.includes(`youtube.com`))return;let e=chrome.i18n.getMessage(`omnibarPrefixVideoPipTitle`)||`Picture-in-Picture (Video)`,t=e=>{e.preventDefault(),e.stopPropagation(),typeof window.__itgOpenVideoPip==`function`?window.__itgOpenVideoPip(window.location.href):console.warn(`window.__itgOpenVideoPip is not available.`)},n=()=>{if(document.getElementById(`itg-yt-pip-button`))return;let n=document.querySelector(`.ytp-right-controls`);if(!n)return;let r=document.createElement(`button`);r.id=`itg-yt-pip-button`,r.className=`ytp-button`,r.setAttribute(`title`,e),r.setAttribute(`aria-label`,e),r.innerHTML=`
                    <svg height="24" width="24" viewBox="0 0 24 24" fill="none">
                        <polygon points="23 7 16 12 23 17 23 7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polygon>
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></rect>
                    </svg>
                `,r.addEventListener(`click`,t);let i=document.querySelector(`.ytp-fullscreen-button`);i&&i.parentNode?i.parentNode.insertBefore(r,i):(document.querySelector(`.ytp-right-controls-right`)||n).appendChild(r)},r=()=>{if(document.getElementById(`itg-yt-shorts-pip-button`))return;let n=document.querySelector(`ytd-shorts-player-controls #right-controls`);if(!n)return;let r=n.querySelector(`#fullscreen-button-shape`);if(!r)return;let i=document.createElement(`div`);i.id=`itg-yt-shorts-pip-button`,i.style.cssText=`display: flex; align-items: center; justify-content: center; position: relative; z-index: 2147483647; pointer-events: auto;`;let a=document.createElement(`button`);a.className=`ytSpecButtonShapeNextHost ytSpecButtonShapeNextTonal ytSpecButtonShapeNextOverlayDark ytSpecButtonShapeNextSizeL ytSpecButtonShapeNextIconButton`,a.setAttribute(`title`,e),a.setAttribute(`aria-label`,e),a.style.cssText=`color: rgb(255, 255, 255); background-color: transparent; position: relative; z-index: 2147483647; pointer-events: auto; cursor: pointer;`,a.innerHTML=`
                    <div aria-hidden="true" class="ytSpecButtonShapeNextIcon">
                        <span class="ytIconWrapperHost" style="width: 24px; height: 24px;">
                            <span class="yt-icon-shape ytSpecIconShapeHost">
                                <div style="width: 100%; height: 100%; display: block; filter: drop-shadow(0px 1px 4px rgba(0, 0, 0, 0.3)); fill: currentcolor;">
                                    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;">
                <polygon points="23 7 16 12 23 17 23 7" fill="none" stroke="currentcolor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polygon>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" fill="none" stroke="currentcolor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></rect>
            </svg>
                                </div>
                            </span>
                        </span>
                    </div>
                `,a.addEventListener(`click`,t),i.appendChild(a),n.insertBefore(i,r)},i=()=>{n(),r()};i(),this._ytPipObserver=new MutationObserver(()=>{i()}),this._ytPipObserver.observe(document.body,{childList:!0,subtree:!0})}_injectTiktokPipButton(){if(!window.location.hostname.includes(`tiktok.com`))return;if(!document.getElementById(`itg-tiktok-pip-styles`)){let e=document.createElement(`style`);e.id=`itg-tiktok-pip-styles`,e.textContent=`
                    /* Hide TikTok's native picture-in-picture controls by default */
                    div[class*="DivPlayerContainer"] div[class*="DivBottom"],
                    div[class*="DivPlayerContainer"] div[class*="DivButtonContainer"],
                    div[class*="DivPlayerContainer"] div[class*="ControlMask"] {
                        opacity: 0 !important;
                        visibility: hidden !important;
                        transition: opacity 0.25s ease-in-out, visibility 0.25s ease-in-out !important;
                    }

                    /* Reveal the controls while hovering the picture-in-picture video */
                    div[class*="DivPlayerContainer"]:hover div[class*="DivBottom"],
                    div[class*="DivPlayerContainer"]:hover div[class*="DivButtonContainer"],
                    div[class*="DivPlayerContainer"]:hover div[class*="ControlMask"] {
                        opacity: 1 !important;
                        visibility: visible !important;
                    }
                `,document.head.appendChild(e)}let e=chrome.i18n.getMessage(`omnibarPrefixVideoPipTitle`)||`Picture-in-Picture (Video)`,t=async e=>{e.preventDefault(),e.stopPropagation();try{let e=document.querySelector(`[data-e2e="more-menu-popover_mini-player"]`);if(e){e.click();return}let t=document.querySelector(`[data-e2e="more-menu-icon"]`);if(t&&(t.click(),await new Promise(e=>setTimeout(e,300)),e=document.querySelector(`[data-e2e="more-menu-popover_mini-player"]`),e)){e.click();return}}catch(e){console.warn(`Failed to trigger TikTok native mini-player:`,e)}},n=()=>{document.querySelectorAll(`a[data-e2e="video-author-avatar"]`).forEach(n=>{let r=n.closest(`[class*="DivAvatarActionItemContainer"]`);if(!r||r.querySelector(`.itg-tiktok-pip-button`))return;let i=document.createElement(`button`);i.type=`button`,i.className=`itg-tiktok-pip-button css-1ydks0-7937d88b--ButtonActionItem efpxn6t0`,i.setAttribute(`title`,e),i.setAttribute(`aria-label`,e),i.style.cssText=`
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        width: 48px;
                        height: 78px;
                        background-color: rgba(0, 0, 0, 0);
                        border: none;
                        padding: 0px;
                        margin: 0px 0px 8px 0px;
                        cursor: pointer;
                        position: relative;
                        transition: opacity 0.25s ease, transform 0.2s ease;
                        opacity: 1;
                        pointer-events: auto;
                        z-index: 10;
                    `;let a=document.createElement(`span`);a.className=`css-1au6o1s-7937d88b--SpanIconWrapper efpxn6t1`,a.style.cssText=`
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        width: 48px;
                        height: 48px;
                        border-radius: 50%;
                        margin-top: 8px;
                        margin-bottom: 6px;
                        background-color: rgba(255, 255, 255, 0.12);
                        color: rgba(255, 255, 255, 0.9);
                        transition: background-color 200ms ease-in-out;
                    `,a.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" fill="currentColor">
                <polygon points="23 7 16 12 23 17 23 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polygon>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></rect>
            </svg>`;let o=document.createElement(`strong`);o.className=`css-f1vcu2-7937d88b--StrongText efpxn6t2`,o.style.cssText=`
                        display: block;
                        color: rgba(255, 255, 255, 0.75);
                        font-family: TikTokFont, Arial, Tahoma, PingFangSC, sans-serif;
                        font-size: 12px;
                        font-weight: 700;
                        line-height: 16px;
                        text-align: center;
                    `,o.textContent=`PiP`,i.appendChild(a),i.appendChild(o),i.addEventListener(`mouseenter`,()=>{a.style.backgroundColor=`rgba(255, 255, 255, 0.2)`,i.style.transform=`scale(1.06)`}),i.addEventListener(`mouseleave`,()=>{a.style.backgroundColor=`rgba(255, 255, 255, 0.12)`,i.style.transform=`scale(1)`}),i.addEventListener(`click`,t),r.closest(`article[data-e2e="recommend-list-item-container"]`)||r.closest(`[class*="DivContentFlexLayout"]`)||r.closest(`[class*="DivVideoWrapper"]`)||r.closest(`[class*="DivItemContainer"]`)||r.closest(`[class*="DivPlayerContainer"]`),i.style.opacity=`1`,i.style.pointerEvents=`auto`,r.insertBefore(i,n)})};n();let r=null;this._tiktokPipObserver=new MutationObserver(()=>{r||=setTimeout(()=>{r=null,n()},800)}),this._tiktokPipObserver.observe(document.body,{childList:!0,subtree:!0})}cleanup(){if(this._isCleanedUp=!0,console.log(`[HintMain] Cleaning up previous content script instance...`),this._boundFocusInHandler&&document.removeEventListener(`focusin`,this._boundFocusInHandler),this._boundFocusOutHandler&&document.removeEventListener(`focusout`,this._boundFocusOutHandler),this._boundMainKeyDownHandler&&document.removeEventListener(`keydown`,this._boundMainKeyDownHandler,!0),this._boundMessageHandler)try{chrome.runtime.onMessage.removeListener(this._boundMessageHandler)}catch{}this._videoCheckInterval&&clearInterval(this._videoCheckInterval),this._findVideoInterval&&clearInterval(this._findVideoInterval),this._shortsCheckInterval&&clearInterval(this._shortsCheckInterval),this._ytPipObserver&&=(this._ytPipObserver.disconnect(),null),this._tiktokPipObserver&&=(this._tiktokPipObserver.disconnect(),null);try{document.body.classList.remove(`itg-pip-shorts`),document.body.classList.remove(`itg-hide-masthead`)}catch{}this.shadowUI&&this.shadowUI.cleanup(),this.hintEngine&&this.hintEngine.cleanup(),this.snippetManager&&this.snippetManager.cleanup(),this.helpModal&&this.helpModal.cleanup(),this.omniBar&&this.omniBar.cleanup(),this.linkPreviewManager&&this.linkPreviewManager.cleanup()}async _handleKeyDown(e){if(this._isCleanedUp)return;if(!chrome.runtime||!chrome.runtime.id){this.cleanup();return}if(!this.hintsGloballyEnabled)return;if(this.helpModal.visible){e.key===`Escape`&&(await this.helpModal.toggle(),e.preventDefault(),e.stopPropagation());return}if(this.omniBar.active){if(e.key===`Escape`){this.omniBar.close(),e.preventDefault(),e.stopPropagation();return}let t=window.getSelection(),n=t&&!t.isCollapsed;if(e.key===`i`&&n){this.omniBar.recoverFocus(),e.preventDefault(),e.stopPropagation();return}return}if(e.key===`Escape`){if(this.hintEngine.active){this.hintEngine.clear(),e.preventDefault(),e.stopPropagation();return}let t=window.getSelection();if(t&&!t.isCollapsed){t.removeAllRanges(),e.preventDefault(),e.stopPropagation();return}if(this.insertMode||Utils.isInputLikeElement(e.target)){this.insertMode=!1;return}chrome.runtime.sendMessage({action:`cancelTabPageMode`},e=>{chrome.runtime.lastError});return}if(this.insertMode||Utils.isInputLikeElement(e.target))return;if(e.shiftKey&&e.key===`?`){if(this.omniBar&&this.omniBar.active)return;let t=e.composedPath&&e.composedPath()[0];if(t&&t!==e.target)return;e.preventDefault(),e.stopPropagation(),this.helpModal.toggle();return}if(this.hintEngine.active&&this.hintEngine.handleKey(e))return;if(e.altKey){e.key===`j`?(chrome.runtime.sendMessage({action:`previousTab`}),e.preventDefault(),e.stopPropagation()):e.key===`k`&&(chrome.runtime.sendMessage({action:`nextTab`}),e.preventDefault(),e.stopPropagation());return}if(e.ctrlKey||e.metaKey||e.key===`Tab`&&this._handleTabSearch(e))return;let t=window.getSelection();if(t.rangeCount>0&&!t.isCollapsed&&this._handleSelectionKeys(e,t)){e.preventDefault(),e.stopPropagation();return}if(e.key.length===1&&!e.altKey){let t=this.commands.getMappings();if(e.repeat){t[e.key]&&(t[e.key].action(),e.preventDefault(),e.stopPropagation());return}clearTimeout(this.keyTimeout),this.keySequence+=e.key;let n=Object.keys(t).filter(e=>e.startsWith(this.keySequence));n.length===1&&n[0]===this.keySequence?(t[this.keySequence].action(),this.keySequence=``,e.preventDefault(),e.stopPropagation()):n.length>0?(this.keyTimeout=setTimeout(()=>{t[this.keySequence]&&t[this.keySequence].action(),this.keySequence=``},400),e.preventDefault(),e.stopPropagation()):this.keySequence=``}}_handleTabSearch(e){let t=window.getSelection();if(t&&!t.isCollapsed){let n=t.toString().trim();if(n){let r=this._findAllTextOccurrences(n);if(r.length>1){let n=t.getRangeAt(0),i=r.findIndex(e=>e.startContainer===n.startContainer&&e.startOffset===n.startOffset);i===-1&&(i=0);let a=r[e.shiftKey?(i-1+r.length)%r.length:(i+1)%r.length];t.removeAllRanges(),t.addRange(a),a.startContainer.parentElement.scrollIntoView({behavior:`smooth`,block:`center`})}return e.preventDefault(),e.stopPropagation(),!0}}return!1}_handleSelectionKeys(e,t){let n=!0;switch(e.key){case`j`:t.modify(`extend`,`forward`,`line`);break;case`k`:t.modify(`extend`,`backward`,`line`);break;case`h`:t.modify(`extend`,`backward`,`character`);break;case`l`:t.modify(`extend`,`forward`,`character`);break;case`e`:t.modify(`extend`,`forward`,`word`);break;case`u`:t.modify(`extend`,`backward`,`documentboundary`);break;case`d`:t.modify(`extend`,`forward`,`documentboundary`);break;case`n`:t.modify(`extend`,`forward`,`paragraph`);break;case`p`:t.modify(`extend`,`backward`,`paragraph`);break;case`c`:document.execCommand(`copy`);break;default:n=!1;break}return n}_findAllTextOccurrences(e){if(!e)return[];let t=[],n=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:e=>[`SCRIPT`,`STYLE`].includes(e.parentNode.tagName)||!Utils.isVisible(e.parentNode)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}),r=new RegExp(e.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`),`gi`),i;for(;i=n.nextNode();){let e;for(r.lastIndex=0;(e=r.exec(i.textContent))!==null;){let n=document.createRange();n.setStart(i,e.index),n.setEnd(i,e.index+e[0].length),t.push(n)}}return t}};if(window.__itgHintMainInstance)try{window.__itgHintMainInstance.cleanup()}catch(e){console.error(`[HintMain] Error cleaning up previous instance:`,e)}var t=()=>{window.__itgHintMainInstance=new e,window.__itgHintMainInstance.init()};document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,t):t();})()
