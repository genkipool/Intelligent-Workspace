<div id="snippet-help-modal" class="snippet-help-modal">
    <div class="snippet-help-modal-content">
        <div class="snippet-help-modal-header">
            <h2 data-i18n="snippetHelpTitle"></h2>
            <button id="close-snippet-help" type="button" class="snippet-help-close-btn">&times;</button>
        </div>
        <div class="snippet-help-modal-body">
            <section class="help-section">
                <h3 data-i18n="snippetHelpIntroTitle"></h3>
                <p data-i18n="snippetHelpIntroDesc"></p>
                <div class="itg-info-note">
                    <span class="label label-inline" data-i18n="snippetHelpVarNoteLabel"></span>
                    <span data-i18n="snippetHelpVarNote"></span>
                </div>
            </section>

            <div class="help-divider"></div>

            <section class="help-section">
                <h3 data-i18n="snippetHelpPopupTitle"></h3>
                <p class="help-section-text">
                    <span data-i18n="snippetHelpPopupDescPrefix"></span>
                    <code class="snippet-popup-trigger-code" style="color: var(--text-on-color);">$$</code>
                    <span data-i18n="snippetHelpPopupDescSuffix"></span>
                </p>
            </section>

            <div class="help-divider"></div>

            <section class="help-section">
                <h3 data-i18n="snippetHelpBasicTitle"></h3>
                <p data-i18n="sh_basic_desc" class="help-section-desc"></p>
                <div class="example-box">
                    <div class="example-row">
                        <span class="label" data-i18n="sh_trigger"></span>
                        <code>/hi</code>
                    </div>
                    <div class="example-row">
                        <span class="label" data-i18n="sh_expansion"></span>
                        <span
                            ><span data-i18n="sh_exp_hi"></span><span data-i18n="sh_juan"></span><span
                                data-i18n="sh_exp_how_are_you"
                            ></span></span
                        >
                    </div>
                    <div class="example-usage">
                        <div class="usage-row">
                            <span class="label" data-i18n="sh_usage"></span>
                            <code>/hi</code> <span data-i18n="sh_plus_space"></span>
                        </div>
                        <div class="usage-row">
                            <span class="label" data-i18n="sh_result"></span>
                            <span data-i18n="sh_basic_res"></span>
                        </div>
                    </div>
                </div>
            </section>

            <section class="help-section">
                <h3 data-i18n="snippetHelpOneVarTitle"></h3>
                <p data-i18n="sh_var_desc" class="help-section-desc"></p>
                <div class="example-box">
                    <div class="example-row">
                        <span class="label" data-i18n="sh_trigger"></span>
                        <code>/hi</code>
                    </div>
                    <div class="example-row">
                        <span class="label" data-i18n="sh_expansion"></span>
                        <span
                            ><span data-i18n="sh_exp_hi"></span><span class="var-highlight" data-i18n="sh_juan"
                            ></span><span data-i18n="sh_exp_free_tomorrow"></span></span
                        >
                    </div>
                    <div class="variable-details">
                        <div class="var-row">
                            <span class="label" data-i18n="sh_id_label"></span><span class="id_var">$1</span>
                        </div>
                        <div class="var-row">
                            <span class="label" data-i18n="sh_var_label_1"></span>
                            <span class="var-highlight" data-i18n="sh_juan"></span>
                        </div>
                        <div class="var-row">
                            <span class="label" data-i18n="sh_def_label"></span>
                            <span class="value_default" data-i18n="sh_juan"></span>
                        </div>
                    </div>
                    <div class="example-usage">
                        <div class="usage-group">
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_usage"></span>
                                <code>/hi</code> <span data-i18n="sh_plus_space"></span>
                            </div>
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_result"></span>
                                <span data-i18n="sh_var_res1"></span>
                            </div>
                        </div>
                        <div class="usage-group">
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_usage"></span>
                                <code>/hi$1Alvaro</code> <span data-i18n="sh_plus_space"></span>
                            </div>
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_result"></span>
                                <span data-i18n="sh_var_res2"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section class="help-section">
                <h3 data-i18n="snippetHelpMultiVarTitle"></h3>
                <p data-i18n="sh_multivar_desc" class="help-section-desc"></p>
                <div class="example-box">
                    <div class="example-row">
                        <span class="label" data-i18n="sh_trigger"></span>
                        <code>/hi</code>
                    </div>
                    <div class="example-row">
                        <span class="label" data-i18n="sh_expansion"></span>
                        <span
                            ><span data-i18n="sh_exp_hi"></span><span class="var-highlight" data-i18n="sh_juan"
                            ></span><span data-i18n="sh_exp_free_prefix"></span><span
                                class="var-highlight"
                                data-i18n="sh_tomorrow"
                            ></span><span data-i18n="sh_exp_question">?</span></span
                        >
                    </div>
                    <div class="variable-details">
                        <div class="var-row">
                            <span class="label" data-i18n="sh_id_label"></span><span class="id_var">$1</span>
                        </div>
                        <div class="var-row">
                            <span class="label" data-i18n="sh_var_label_1"></span>
                            <span class="var-highlight" data-i18n="sh_juan"></span>
                        </div>
                        <div class="var-row">
                            <span class="label" data-i18n="sh_def_label"></span>
                            <span class="value_default" data-i18n="sh_juan"></span>
                        </div>
                        <br />
                        <div class="var-row">
                            <span class="label" data-i18n="sh_id_label"></span>
                            <span class="id_var">$2</span>
                        </div>
                        <div class="var-row">
                            <span class="label" data-i18n="sh_var_label_2"></span>
                            <span class="var-highlight" data-i18n="sh_tomorrow"></span>
                        </div>
                        <div class="var-row">
                            <span class="label" data-i18n="sh_def_label"></span>
                            <span class="value_default" data-i18n="sh_tomorrow"></span>
                        </div>
                    </div>
                    <div class="example-usage">
                        <div class="usage-group">
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_usage"></span>
                                <code>/hi</code> <span data-i18n="sh_plus_space"></span>
                            </div>
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_result"></span>
                                <span data-i18n="sh_multivar_res1"></span>
                            </div>
                        </div>
                        <div class="usage-group">
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_usage"></span>
                                <code>/hi$1Alvaro</code> <span data-i18n="sh_plus_space"></span>
                            </div>
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_result"></span>
                                <span data-i18n="sh_multivar_res2"></span>
                            </div>
                        </div>
                        <div class="usage-group">
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_usage"></span>
                                <code>/hi$1Alvaro$2today</code> <span data-i18n="sh_plus_space"></span>
                            </div>
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_result"></span>
                                <span data-i18n="sh_multivar_res3"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section class="help-section">
                <h3 data-i18n="snippetHelpSpacesTitle">Example with Multiple Variables and Spaces</h3>
                <p data-i18n="sh_spaces_desc" class="help-section-desc-spaced"></p>
                <div class="example-box">
                    <div class="example-usage">
                        <div class="usage-group">
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_usage">Usage:</span>
                                <code>/hi$1Alvaro$2to__go__for__a__coffee</code>
                                <span data-i18n="sh_plus_space">+ Space</span>
                            </div>
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_result">Result:</span>
                                <span data-i18n="sh_space_res">Hello Alvaro, are you free to go for a coffee?</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section class="help-section">
                <h3 data-i18n="snippetHelpForcePlainTitle">Force Plain Text</h3>
                <p data-i18n="sh_force_plain_desc" class="help-section-desc"></p>
                <div class="example-box">
                    <div class="example-row">
                        <span class="label" data-i18n="sh_trigger"></span>
                        <code>/hi</code>
                    </div>
                    <div class="example-row">
                        <span class="label" data-i18n="sh_expansion"></span>
                        <span
                            ><span data-i18n="sh_exp_hi"></span><b><span data-i18n="sh_juan"></span></b><span
                                data-i18n="sh_exp_how_are_you"
                            ></span></span
                        >
                    </div>
                    <div class="example-usage">
                        <div class="usage-group">
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_usage"></span>
                                <code>/hi</code> <span data-i18n="sh_plus_space"></span>
                            </div>
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_result"></span>
                                <span data-i18n="sh_force_plain_res_with"></span>
                            </div>
                        </div>
                        <div class="usage-group">
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_usage"></span>
                                <code>/hi#</code> <span data-i18n="sh_plus_space"></span>
                            </div>
                            <div class="usage-row">
                                <span class="label" data-i18n="sh_result"></span>
                                <span data-i18n="sh_force_plain_res_without"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </div>
</div>
