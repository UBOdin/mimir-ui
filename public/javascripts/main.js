$( document ).ready(function() {

    /*
    Basic interactive animations
    */
    $("#about_btn").on("click", function() {
        $("#about").toggle(100);
    });

    $("#upload").on("click", function() {
        $("#drop_area").toggle(100);
    });

    $(".close_btn").on("click", function() {
        $(this).parent().hide(100);
    });

    /*
    Generate query for showing tables and lenses
    */
    $(document).on("click", ".table_link, .lens_link", function() {
        var table = $(this).html();
        var query = "SELECT * FROM "+table+";";

        $("#query_textarea").val(query);
        $("#query_btn").trigger("click");
    });

    /*
    Change the working database
    */
    $(".db_link").on("click", function() {
        $("#change_db_field").val($(this).html());
        $("#change_db_form").submit();
    });

    /*
    Create a new database
    */
    $("#create_database").on("click", function() {
        var db = prompt("Please enter a name for the new database", "awesomedb");
        var existing_dbs = new Array();

        // Check for valid name
        if(!db.match(/^\w+$/))
            alert("That is not a valid name, please try again");

        db += ".db";

        $(".db_link").each(function() {
            existing_dbs.push($(this).html());
        });

        if($.inArray(db, existing_dbs) != -1) {
            alert("A database with the name "+db+" already exists");
        }
        else {
            $("#create_db_field").val(db);
            $("#create_db_form").submit();
        }
    });


    /*
    Plugin Configurations
    */

    /*
    ColResizable
    http://www.bacubacu.com/colresizable/

    Resizable columns, automatic adjustment
    for equally spaced columns
    */
    $("#result_table").colResizable( {
        liveDrag: true,
        minWidth: 10
    });

    /*
    Dropzone
    http://www.dropzonejs.com

    Enables csv upload
    */
    Dropzone.options.myAwesomeDropzone = {
      maxFilesize: 100000, // MB
      acceptedFiles: ".csv",
      addRemoveLinks: true,
      init: function() {
        this.on('success', function () {
            var acceptedFiles = [];
            this.getAcceptedFiles().forEach(function (element, index, array) {
                acceptedFiles.push(element.name.replace(/\.csv/i, ""));
            });
            var listedFiles = [];
            $(".table_link").each( function() {
                listedFiles.push( $(this).html() );
            });
            acceptedFiles.forEach(function (element, index, array) {
                var i;
                var found = false;
                for(i= 0; i<listedFiles.length; i++) {
                    if(element.toUpperCase() === listedFiles[i].toUpperCase()) {
                        found = true;
                        break;
                    }
                }

                if(!found) {
                    $("#select_table").append('<li><a class="table_link ">'+element.toUpperCase()+'</a></li>');
                }
            });
        });
        this.on("error", function() {
            var span = $("span[data-dz-errormessage]");
            span.html("There is no table with this name in the current database!");
        });
      }
    };

    /*
    Tooltipster
    http://iamceege.github.io/tooltipster/

    For tooltips
    */

    // Cell level uncertainty
    $(".non_deterministic_cell").one("click", function(e) {
        $(this).tooltipster({
            animation: 'grow',
            contentAsHTML: 'true',
            delay: 10,
            interactive: true,
            minWidth: 350,
            maxWidth: 350,
            position: 'bottom',
            theme: 'tooltipster-shadow',
            trigger: 'click',
            functionInit: function(origin, content) {

                // Get content through ajax queries

                var col_index = origin.prevAll().length - 1;
                var col = origin.parents('table').find('th').eq(col_index).text();
                var row = origin.parent().children(".rowid_col").html();
                var query = $("#last_query_field").val().replace(";","");
                var db = $("#db_field").val();

                var bounds = null;
                var stddev = null;
                var mean = null;
                var examples = null;
                var causes = [];

                var fault = false;
                var errormessage = "";

                var explain_query = 'explainCol?query='+query+';&row='+row+'&ind='+ col_index
                                        +'&db='+db;

                if (content == null) {

                    $.when(
                        $.get(explain_query, function (res) {
                            console.log(res);
                            res = JSON.parse(res)
                            if(res.hasOwnProperty('error')) {
                                fault = true;
                                errormessage += res.error+'<br/>';
                            }
                            else {
                                if(res.hasOwnProperty('bounds')){
                                    bounds = res['bounds']
                                }
                                if(res.hasOwnProperty('mean')){
                                    mean = res['mean']
                                }
                                if(res.hasOwnProperty('stddev')){
                                    stddev = res['stddev']
                                }
                                if(res.hasOwnProperty('examples')){
                                    examples = res['examples']
                                }
                                causes = res['reasons']
                            }
                        })
                    ).then( function() {
                        if(fault) {
                            origin.tooltipster('content', 'Something went wrong!<br/><br/>'+errormessage);
                        }
                        else {
                            var tooltip_body = $("<tbody>")

                            tooltip_body.append(
                                $("<tr>").append(
                                    $("<th>", {scope: "row"}).html("Possibilities")
                                ).append(
                                    $("<td>").html(examples)
                                )
                            )

                            if(bounds){
                                tooltip_body.append(
                                    $("<tr>").append(
                                        $("<th>", {scope: "row"}).html("Bounds")
                                    ).append(
                                        $("<td>").html(bounds)
                                    )
                                )
                            }
                            if(mean){
                                tooltip_body.append(
                                    $("<tr>").append(
                                        $("<th>", {scope: "row"}).html("Expectation")
                                    ).append(
                                        $("<td>").html(mean)
                                    )
                                )
                            }
                            if(stddev){
                                tooltip_body.append(
                                    $("<tr>").append(
                                        $("<th>", {scope: "row"}).html("Std. Dev.")
                                    ).append(
                                        $("<td>").html(stddev)
                                    )
                                )
                            }

                            tooltip_body.append(
                                $("<tr>").append(
                                    $("<th>", {scope: "row"}).html("Reasons")
                                ).append(
                                    $("<td>").append($("<ul>").append(listifyCauses(causes, origin)))
                                )
                            )
                            
                            var tooltip_template = 
                                $("<table>", {class: "table tooltip_table"}).append(tooltip_body)

                            origin.tooltipster('content', tooltip_template);
                        }
                    });

                    // this returned string will overwrite the content of the tooltip for the time being
                    return '<b>Loading...</b>';
                }
                else {
                    // return nothing : the initialization continues normally with its content unchanged.
                }
            },
        });

        // User click only attached the listener, now trigger click
        // to actually display the tooltip
        $(this).click();
    });

    // Row level uncertainty
    $(".non_deterministic_row").one("click", function(e) {
        $(this).tooltipster({
            animation: 'grow',
            contentAsHTML: 'true',
            delay: 10,
            interactive: true,
            minWidth: 350,
            maxWidth: 350,
            position: 'top-right',
            theme: 'tooltipster-shadow',
            trigger: 'click',
            functionInit: function(origin, content) {

                var row = origin.children(".rowid_col").html();
                var query = $("#last_query_field").val().replace(";","");
                var db = $("#db_field").val();

                var prob;
                var causes = [];

                var fault = false;
                var errormessage = "";

                var explain_query = 'explainRow?query='+query+';&row='+row
                                        +'&db='+db;

                if (content == null) {
                    $.when(
                        $.get(explain_query, function (res) {
                            console.log(res)
                            res = JSON.parse(res)
                            if(res.hasOwnProperty('error')) {
                                fault = true;
                                errormessage += res.error+'<br/>';
                            }
                            else {
                                causes = res["reasons"];
                                prob = res["probability"];
                            }
                        })
                    ).then( function() {
                        if(fault) {
                            origin.tooltipster('content', 'Something went wrong!<br/><br/>'+errormessage);
                        }
                        else {
                            var tooltip_template = 
                                $("<table>", { class: "table tooltip_table" }).append(
                                    $("<tbody>").append(
                                        $("<tr>").append(
                                            $("<th>", {scope: "row"}).html("Confidence")
                                        ).append(
                                            $("<td>", {class: "number"}).html(prob)
                                        )
                                    ).append(
                                        $("<tr>").append(
                                            $("<th>", {scope: "row"}).html("Reasons")
                                        ).append(
                                            $("<td>", {class: "number"}).append(
                                                $("<ul>").append(listifyCauses(causes, origin))
                                            )
                                        )
                                    )
                                )
                            origin.tooltipster('content', tooltip_template);
                        }
                    });

                    // this returned string will overwrite the content of the tooltip for the time being
                    return '<b>Loading...</b>';
                }
                else {
                    // return nothing : the initialization continues normally with its content unchanged.
                }
            },
        });

        $(this).click();
    });


    function get_query_name(on_ready) 
    {
        var query = $("#last_query_field").val().replace(";.*","");
        var db = $("#db_field").val();
        var name_query = 'queryName?query='+query+';&db='+db;

        $.get(name_query, function (res) {
            console.log(res);
            if(typeof res == "string"){
                res = JSON.parse(res)
            }
            if(res.hasOwnProperty('error')) {
                fault = true;
                errormessage += res.error+'<br/>';
            } else {
                on_ready(res["result"])
            }
        })         
    }

    function get_query_schema(on_ready) 
    {
        var query = $("#last_query_field").val().replace(";.*","");
        var db = $("#db_field").val();
        var schema_query = 'querySchema?query='+query+';&db='+db;

        $.get(schema_query, function (res) {
            console.log(res);
            if(typeof res == "string"){
                res = JSON.parse(res)
            }
            if(res.hasOwnProperty('error')) {
                fault = true;
                errormessage += res.error+'<br/>';
            } else {
                on_ready(res);
            }
        })         
    }

    /* Lens create buttons */
    $("#type_inference_btn").click( function() {
        get_query_name(function(name) {
            $("#ti_lens_name").val(name+"TYPED");
            $("#black-box").show();
            $("#ti_lens_div").show();
    
            $("#black-box").click( function() {
                $("#ti_lens_div").hide();
                $(this).hide();
            });
        })
    });

    $("#ti_lens_create_btn").click( function() {
        var name = $("#ti_lens_name").val();
        if(name === "") {
            alert("Please enter a name for the lens");
            return;
        }

        var ratio = $("#ti_lens_param").val();

        var subquery = $("#last_query_field").val();
        var createlens = "CREATE LENS "+name+" AS "+subquery+" WITH TYPE_INFERENCE("+ratio+");"

        var select = "SELECT * FROM "+name+";"
        var query = createlens+"\n"+select;

        $("#query_textarea").val(query);
        $("#query_btn").trigger("click");
    });

    $("#missing_value_btn").click( function() {
        get_query_name(function(name) {
            $("#mv_lens_name").val(name+"INTERPOLATED");
            $("#black-box").show();
            $("#mv_lens_div").show();

            var dropdown = $("#mv_lens_param");
            if(dropdown.children("option").length <= 0) {
                $("#result_table").children("thead").children().children().not(".rowid_col, .row_selector").each( function () {
                    dropdown.append($("<option />").val($(this).html()).text($(this).html()));
                });
            }

            $("#black-box").click( function() {
                $("#mv_lens_div").hide();
                $(this).hide();
            });
        })
    });

    $("#mv_lens_create_btn").click( function() {
        var name = $("#mv_lens_name").val();
        if(name === "") {
            alert("Please enter a name for the lens");
            return;
        }

        var param = $("#mv_lens_param").val();
        param = param.map( function (val) {
            return "'"+val+"'";
        });

        var subquery = $("#last_query_field").val();
        var createlens = "CREATE LENS "+name+" AS "+subquery+" WITH MISSING_VALUE("+param+");"

        var select = "SELECT * FROM "+name+";"
        var query = createlens+"\n"+select;

        $("#query_textarea").val(query);
        $("#query_btn").trigger("click");
    });

    $("#schema_matching_btn").click( function() {
        get_query_name(function(name) {
            $("#sm_lens_name").val(name+"MATCHED");
            $("#black-box").show();
            $("#sm_lens_div").show();

            $("#black-box").click( function() {
                $("#sm_lens_div").hide();
                $(this).hide();
            });
        })
    });


    $("#sm_lens_create_btn").click( function() {
        var name = $("#sm_lens_name").val();
        if(name === "") {
            alert("Please enter a name for the lens");
            return;
        }

        var param = $("#sm_lens_param").val();
        param = param.split("[")[1].replace("]", "");
        console.log(param)
        param = param.split(", ").map(function(f){return "'"+f+"'"}).join(", ")
        console.log(param)

        var subquery = $("#last_query_field").val();
        var createlens = "CREATE LENS "+name+" AS "+subquery+" WITH SCHEMA_MATCHING("+param+");"

        var select = "SELECT * FROM "+name+";"
        var query = createlens+"\n"+select;
        console.log(createlens)

        $("#query_textarea").val(query);
        $("#query_btn").trigger("click");
    });
    
    $("#missing_key_btn").click( function() {
        get_query_name(function(name) {
            $("#mk_lens_name").val(name+"MISSINGKEY");
            $("#black-box").show();
            $("#mk_lens_div").show();

            var dropdown = $("#mk_lens_param");
            if(dropdown.children("option").length <= 0) {
                $("#result_table").children("thead").children().children().not(".rowid_col, .row_selector").each( function () {
                    dropdown.append($("<option />").val($(this).html()).text($(this).html()));
                });
            }

            $("#black-box").click( function() {
                $("#mk_lens_div").hide();
                $(this).hide();
            });
        })
    });
    
    $("#mk_lens_create_btn").click( function() {
        var name = $("#mk_lens_name").val();
        if(name === "") {
            alert("Please enter a name for the lens");
            return;
        }

        var param = $("#mk_lens_param").val();
        param = param.map( function (val) {
            return val;
        });

        var subquery = $("#last_query_field").val();
        var createlens = "CREATE LENS "+name+" AS "+subquery+" WITH MISSING_KEY("+param+");"

        var select = "SELECT * FROM "+name+";"
        var query = createlens+"\n"+select;

        $("#query_textarea").val(query);
        $("#query_btn").trigger("click");
    });
    
    $("#comment_btn").click( function() {
        get_query_name(function(name) {
            $("#comment_lens_name").val(name+"COMMENT");
            $("#black-box").show();
            $("#comment_lens_div").show();
    
            $("#black-box").click( function() {
                $("#comment_lens_div").hide();
                $(this).hide();
            });
        })
    });
    
    $("#comment_lens_create_btn").click( function() {
        var name = $("#comment_lens_name").val();
        if(name === "") {
            alert("Please enter a name for the lens");
            return;
        }

        var expr = $("#comment_lens_param_expr").val();
        var comment = $("#comment_lens_param_comment").val();
        var param = "'" + expr + ";" + comment + "'"
        
        var subquery = $("#last_query_field").val();
        var createlens = "CREATE LENS "+name+" AS "+subquery+" WITH COMMENT("+param+");"

        var select = "SELECT * FROM "+name+";"
        var query = createlens+"\n"+select;

        $("#query_textarea").val(query);
        $("#query_btn").trigger("click");
    });

    // assigns a value to each item in the list to later be used
    // to findout which one was selected
    $('#ad_list button').each(function(i,el){
        el.value = i+1;
    });

    //get the table name you selected and the shcma for the lastest query text
     $(".add_data_btn").click( function() {
        var table = $(this).html();
        get_query_schema(function(schema) {         // gets the schema from latest query
            var ad_lens_name = table+"ADDED";
            var qSchema = schema;
            var schemaString = "";

            for (i = 0; i < qSchema.length; i++) { 
                if(i > 0){ schemaString += ", "; }
                schemaString += "'"+qSchema[i].name +" "+ qSchema[i].type+"'";
            }

            var origquery = $("#last_query_field").val();                   //[       ]name until i get the real selected name
            var createlens = "CREATE LENS "+ad_lens_name+" AS SELECT * FROM "+table+" WITH SCHEMA_MATCHING("+schemaString+");" //needs to be schema of last query field* is currently nothign

            var select = origquery+" UNION ALL SELECT * FROM "+ad_lens_name+";";
            var query = createlens+"\n"+select;

            console.log(query)
            $("#query_textarea").val(query);
            $("#query_btn").trigger("click");
        })

        //var ad = document.getElementById("ad_list");
        //var selected_table = ad.buttons[ad.selectedIndex].text;

        //var name = $("#sm_lens_name").val();
        

    });

    $("#list_repair_ack").click(function(){
        var command = "FEEDBACK "
        command += $("#list_repair_model").val()+", "+$("#list_repair_idx").val()
        var args = $("#list_repair_args").val()
        if(args != ""){
            command += " ON "+args
        }
        var choice = $(".list_repair_choice").filter("[checked]").val()
        if(choice === undefined){ alert("ERROR: Nothing selected"); return; }
        command += " SET "+choice+";\n"
        command += $("#last_query_field").val()

        console.log("Clicked Fix: \n"+command)

    });

    Mimir.visualization.drawGraph();
});


/*
Utility functions
*/
function beginFix(reason)
{
    switch(reason.repair.selector){
        case "list": {
            $("#list_repair_explain").html(reason.english)
            $("#list_repair_model").val(reason.source)
            $("#list_repair_idx").val(reason.varid)
            $("#list_repair_args").val(reason.args.join(","))
            for(i = 0; i < reason.repair.values.length; i++){
                var curr = reason.repair.values[i].choice
                var checked = (i == 0) ? " checked" : ""
                console.log("REASON: "+curr)
                $("#list_repair_list").append(
                    $("<div>").html(
                        "<input type='radio' name='list_repair_choice' class='list_repair_choice' value='"+
                            curr+"'"+checked+">&nbsp;&nbsp;"+curr
                    )
                )
            }
            $("#list_repair_div").show()
        } break;

        default:
            alert("Unknown repair selector "+repair.selector)

    }
}

function listifyCauses(causes, origin) {
    var result = $("<div>");
    $.each(causes, function(i, cause){
        console.log(cause);
        var approve = $("<a>", {href: "#", class: "ttOption approve", text: "Approve"});
        var fix = $("<a>", {href: "#", class: "ttOption fix", text: "Fix" })
                    .click(function() { origin.trigger("click"); beginFix(cause); })
        var tag = $("<li>", {class: "paperclip", text: causes[i]['english']})
                    .attr("onmouseover", "highlightFlowNode(this)")
                    .attr("onmouseout", "reverthighlight(this)");
        var modelName = $("<input>").attr("type", "hidden").val(cause.source);
        tag.append("<br/>").append(approve).append(fix)
            .append(modelName);
        result.append(tag);
    });
    return result;
}

function highlightFlowNode(reason){
    var text = $(reason).find("input").val();
    var nodeDivs = getFlowNodes(text);
    $(nodeDivs).find("circle").attr("fill", "orange").attr("r", Mimir.visualization.RADIUS + 3);
    $(nodeDivs).find("text").attr("fill", "brown").attr("font-size", Mimir.visualization.ZOOMFONTSIZE);
}

function reverthighlight(reason){
    var text = $(reason).find("input").val();
    var nodeDivs = getFlowNodes(text);
    $(nodeDivs).find("circle").attr("fill", "black").attr("r", Mimir.visualization.RADIUS);
    $(nodeDivs).find("text").attr("fill", "black").attr("font-size", Mimir.visualization.FONTSIZE);
}

function getFlowNodes(label){
    var nodes = $(".node");
    var selectedNodes = [];
    $.each(nodes, function(i, v){
        var text = v.children[1].textContent;
        if(text == label)
            selectedNodes.push(v);
    });
    return selectedNodes;
}
