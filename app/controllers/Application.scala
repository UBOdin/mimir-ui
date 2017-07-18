package controllers

import java.io.File
import java.sql.SQLException

import mimir.Database
import mimir.sql.InlinableBackend
import mimir.sql.GProMBackend
import mimir.sql.JDBCBackend
import mimir.web._
import mimir.algebra.{QueryNamer, QueryVisualizer, Type, RowIdPrimitive, Typechecker, RAException}
import mimir.sql.{CreateLens, Explain}
import mimir.util.{JSONBuilder}
import mimir.parser.ParseException

import com.typesafe.scalalogging.slf4j.LazyLogging

import play.api.mvc._
import play.api.libs.json._
import net.sf.jsqlparser.statement.Statement
import net.sf.jsqlparser.statement.insert.Insert
import net.sf.jsqlparser.statement.select.Select
import net.sf.jsqlparser.statement.update.Update
import net.sf.jsqlparser.statement.delete.Delete
import net.sf.jsqlparser.statement.drop.Drop
import mimir.sql.ProvenanceStatement
import scala.collection.mutable.ListBuffer
import mimir.ctables.GenericCellExplanation
import mimir.ctables.RowExplanation

/*
 * This is the entry-point to the Web Interface.
 * This class is part of the template provided by the play framework.
 *
 * Each Action, part of the Play API is a function that maps
 * a Request to a Result. Every URL that can be handled by the
 * application is defined in the routes.conf file. Each url
 * has an Action associated with it, which defines what the
 * server should do when the client asks for that URL
 *
 * GET requests pass in args that can be directly extracted
 * from the Action method signatures. POST requests need parsers.
 * For example, if the POST request had form fields attached to
 * it, we use a form body parser
 *
 * Read more about Actions at
 * https://www.playframework.com/documentation/2.0/ScalaActions
 */

class Application extends Controller with LazyLogging {

  /*
   * The Writes interface allows us to convert
   * Scala objects to a JSON representation
   */
  implicit val WebStringResultWrites = new Writes[WebStringResult] {
    def writes(webStringResult: WebStringResult) = Json.obj(
      "result" -> webStringResult.result
    )
  }

  implicit val WebQueryResultWrites = new Writes[WebQueryResult] {
    def writes(webQueryResult: WebQueryResult) = Json.obj(
      "headers" -> webQueryResult.webIterator.header,
      "data" -> webQueryResult.webIterator.data.map(x => x._1),
      "rowValidity" -> webQueryResult.webIterator.data.map(x => x._2),
      "missingRows" -> webQueryResult.webIterator.missingRows,
      "queryFlow" -> webQueryResult.webIterator.queryFlow.toJson().toString()
    )
  }

  implicit val WebErrorResultWrites = new Writes[WebErrorResult] {
    def writes(webErrorResult: WebErrorResult) = Json.obj(
      "error" -> webErrorResult.result
    )
  }

  implicit val WebResultWrites = new Writes[WebResult] {
    def writes(webResult: WebResult) = {
      webResult match {
        case wr:WebStringResult => WebStringResultWrites.writes(wr)
        case wr:WebQueryResult  => WebQueryResultWrites.writes(wr)
        case wr:WebErrorResult  => WebErrorResultWrites.writes(wr)
      }
    }
  }

  implicit val ReasonWrites = new Writes[(String, String)] {
    def writes(tup: (String, String)) = Json.obj("reason" -> tup._1, "lensType" -> tup._2)
  }

  private def prepareDatabase(dbName: String = default_db, backend: String = "sqlite"): Database =
  {
    var ret: Database = null
    try {  
      ret = backend match {
         case "sqlite" => {
            if(true){
              // Set up the database connection(s)
              val tdb = new Database(new JDBCBackend(backend, "databases/" + dbName))
              tdb.backend.open() 
              tdb
            }
            else {
              //Use GProM Backend
              val gp = new GProMBackend(backend, "databases/" + dbName, -1)
              val tdb = new Database(gp)    
              tdb.backend.open()
              gp.metadataLookupPlugin.db = tdb
              tdb
            }
          }
          case _ => new Database(new JDBCBackend(backend, dbName))
        }
      this.db_name = dbName
      //ret.backend.asInstanceOf[InlinableBackend].enableInlining(db)
      ret.initializeDBForMimir()
    } finally {
      ret.backend.close()
    }
    return ret
  }

  private def handleStatements(input: String): (List[Statement], List[WebResult]) = {

    logger.debug(s"Received query $input")

    val statements = db.parse(input)

    val results = statements.map({
      /*****************************************/           
      case s: Select => {
        val start = System.nanoTime()
        val raw = db.sql.convert(s)
        val rawT = System.nanoTime()
        
        val resultsT = System.nanoTime()
          println("Convert time: "+((rawT-start)/(1000*1000))+"ms")
          println("Compile time: "+((resultsT-rawT)/(1000*1000))+"ms")

          val wIter: WebIterator = generateWebIterator(raw)
          try{
            wIter.queryFlow = QueryVisualizer.convertToTree(db, raw)
          } catch {
            case e: Throwable => {
              e.printStackTrace()
              wIter.queryFlow = new OperatorNode("", List(), None)
            }
          }
          
          new WebQueryResult(wIter)       
      }
      /*****************************************/
      case s: ProvenanceStatement => {
        val start = System.nanoTime()
        val raw = db.sql.convert(s)
        val rawT = System.nanoTime()
        val resultsT = System.nanoTime()

        println("Convert time: "+((rawT-start)/(1000*1000))+"ms")
        println("Compile time: "+((resultsT-rawT)/(1000*1000))+"ms")

        val wIter: WebIterator = generateWebIterator(raw)
        try{
          wIter.queryFlow = QueryVisualizer.convertToTree(db, raw)
        } catch {
          case e: Throwable => {
            e.printStackTrace()
            wIter.queryFlow = new OperatorNode("", List(), None)
          }
        }
        
        new WebQueryResult(wIter)
        
      }
      /*****************************************/           
      case s: CreateLens =>
        db.update(s)
        new WebStringResult("Lens created successfully.")
      /*****************************************/           
      case s: Explain => {
        val raw = db.sql.convert(s.getSelectBody());
        val op = db.compiler.optimize(raw)
        val res = "------ Raw Query ------\n"+
          raw.toString()+"\n"+
          "--- Optimized Query ---\n"+
          op.toString

        new WebStringResult(res)
      }
      /*****************************************/           
      case s: Statement =>
        db.update(s)
        new WebStringResult("Database updated.")
    })
    (statements, results)
  }

  def allDatabases : Array[String] =
  {
    val curDir = new File(".", "databases")
    curDir.listFiles().
      filter( f => f.isFile && f.getName.endsWith(".db")).
      map(x => x.getName)
  }

  def allSchemas: Seq[(String, Seq[(String, Type)])] = {
    db.getAllTables.toList.
      map{ (x) =>   (x, db.tableSchema(x).get) }.
      sortBy(_._1)
  }

  def allVisibleSchemas: Seq[(String, Seq[(String, Type)])] = {
    allSchemas.filter( (x) => { 
      (!x._1.startsWith("MIMIR_")) &&
      (!x._1.endsWith("_RAW"))
    })
  }

  val default_db = "ui_demo.db"
  var db = prepareDatabase()
  var db_name = default_db

  def withOpenDB[A](op: (() => A)): A =
  {
    try {
      db.backend.open()
      db.backend match {
        case j:InlinableBackend => j.enableInlining(db)
      }
      return op()
    } finally {
      db.backend.close()
    }
  }

  /*
   * Actions
   */
  def index = Action {
    withOpenDB { () =>
      val result: WebResult = new WebStringResult("Query results show up here...")
      Ok(views.html.index(this, "", result, ""))
    }
  }


  /**
   * Database selection handlers
   */
  def changeDB = Action { request =>

    val form = request.body.asFormUrlEncoded
    val newDBName = form.get("db").head

    if(!db_name.equalsIgnoreCase(newDBName)) {
      prepareDatabase(newDBName)
    }

    withOpenDB { () =>
      Ok(views.html.index(this, "",
        new WebStringResult("Working database changed to "+newDBName), ""))
    }

  }

  def createDB = Action { request =>

    val form = request.body.asFormUrlEncoded
    val newDBName = form.get("db").head

    prepareDatabase(newDBName)

    withOpenDB { () => 
      db.initializeDBForMimir()
      Ok(views.html.index(this, "",
        new WebStringResult("Database "+newDBName+" successfully created."), ""))
    }

  }

  /**
   * Query handlers
   */
  def query = Action { request =>
    println(request.body.asFormUrlEncoded)
    val form = request.body.asFormUrlEncoded
    val query = form.get("query")(0)
    withOpenDB { () =>
      try {
        val (statements, results) = handleStatements(query)
        Ok(views.html.index(this, query, results.last, statements.last.toString))
      } catch {
          case e: Throwable => 
            e.printStackTrace()
            Ok(views.html.index(this, query, 
              new WebErrorResult(e.getMessage),
              query
            ))
      }
    }
  }

  def nameForQuery(queryString: String) = Action {
    withOpenDB { () => 
      try {
        val querySql = db.parse(queryString).last.asInstanceOf[Select]
        val queryRA = db.sql.convert(querySql)
        val name = QueryNamer.nameQuery(db.compiler.optimize(queryRA))

        Ok(
          Json.obj(
            "result" -> name
          )
        );

      } catch {
        case e: Throwable => {
          e.printStackTrace()
          InternalServerError("ERROR: "+e.getMessage())
        }
      }
    }
  }

  def schemaForQuery(queryString: String) = Action {
    withOpenDB { () => 
      try {
        val querySql = db.parse(queryString).last.asInstanceOf[Select]
        val queryRA = db.sql.convert(querySql)

        val schema = 
          JSONBuilder.list(db.bestGuessSchema(queryRA).map({
              case (name, t) => JSONBuilder.dict(Map(
                "name" -> JSONBuilder.string(name),
                "type" -> JSONBuilder.string(Type.toString(t)) 
                ))
              })
            )

        Ok(schema)

      } catch {
        case e: Throwable => {
          e.printStackTrace()
          InternalServerError("ERROR: "+e.getMessage())
        }
      }
    }
  }

  def queryGet(query: String) = Action {
    withOpenDB { () => 
      println(query)
      val (statements, results) = handleStatements(query)
      Ok(views.html.index(this, query, results.last, statements.last.toString))
    }
  }

  def queryJson(query: String) = Action {
    withOpenDB { () => 
      val (statements, results) = handleStatements(query)

      Ok(Json.toJson(results.last))
    }
  }


  /**
   * Load CSV data handlerƒ
   */
  def loadTable = Action(parse.multipartFormData) { request =>
//    webAPI.synchronized(
    withOpenDB { () => 

      request.body.file("file").map { csvFile =>
        val name = csvFile.filename
        val dir = play.Play.application().path().getAbsolutePath

        val newFile = new File(dir, name)
        csvFile.ref.moveTo(newFile, true)
        db.loadTable(name)
        newFile.delete()
      }

      val result: WebResult = new WebStringResult("CSV file loaded.")
      Ok(views.html.index(this, "", result, ""))
    }
  }


  /**
   * Return a list of all tables
   */
  def getAllDatabases() = Action {
    Ok(Json.toJson(allDatabases))
  }

  def getRowExplain(query: String, rowString: String) = Action {
    withOpenDB { () => 
     db.backend.open()
      try {
        println("explainRow: From UI: [ "+ rowString +" ] [" + query + "]"  ) ;
        val oper = db.compiler.optimize(db.sql.convert(db.parse(query).head.asInstanceOf[Select]))
        val rowidprim = RowIdPrimitive(rowString)
        val cols = oper.columnNames
        val reasons = db.explainer.getFocusedReasons(db.explainer.explainSubset(
              db.explainer.filterByProvenance(oper,rowidprim), 
              Seq().toSet, true, false))
        Ok(
            RowExplanation(
        			0.0,
        			reasons.toList,
    					rowidprim)
    			.toJSON)
      } catch {
        case t: Throwable => {
          t.printStackTrace() // TODO: handle error
          BadRequest("Not A Query: "+query)
        }
      }
    }
  }

  def getColExplain(query: String, rowString: String, colIndexString: String) = Action {
    withOpenDB { () => 
      db.backend.open()

      try {
        println("explainCell: From UI: [" + colIndexString + "] [ "+ rowString +" ] [" + query + "]"  ) ;
        val col = Integer.parseInt(colIndexString)
        val oper = db.compiler.optimize(db.sql.convert(db.parse(query).head.asInstanceOf[Select]))
        val cols = oper.columnNames
        val rowidprim = RowIdPrimitive(rowString)
        val provFilteredOper = db.explainer.filterByProvenance(oper,rowidprim)
        val subsetReasons = db.explainer.explainSubset(
                provFilteredOper, 
                Seq(cols(col)).toSet, false, false)
        val reasons = db.explainer.getFocusedReasons(subsetReasons)
        Ok(
            GenericCellExplanation(
    					reasons.map(reason => reason.repair match { 
    					  case mimir.ctables.RepairFromList(choices) => choices.map(_._1)
    					  case mimir.ctables.RepairByType(t) => reason.hints
    					  case x => Seq(mimir.algebra.StringPrimitive(x.exampleString))
    					  }).flatten.toList,
    					reasons.toList,
    					rowidprim,
    					cols(col)
				  ).toJSON)
      } catch {
          case t: Throwable => {
            t.printStackTrace() // TODO: handle error
            BadRequest("Not A Query: "+query)
          }
        }
    }
  }
  
  def generateWebIterator(oper: mimir.algebra.Operator): WebIterator =
  {
    db.query(oper)(results => {
      val startTime = System.nanoTime()
      // println("SCHEMA: "+result.schema)
      val headers: List[String] = "MIMIR_ROWID" :: results.schema.map(_._1).toList
      val data: ListBuffer[(List[String], Boolean)] = new ListBuffer()
  
      var i = 0
      while(results.hasNext()){
        val row = results.next()
        val list =
          (
            row.provenance.payload.toString ::
              results.schema.zipWithIndex.map( _._2).map( (i) => {
                row(i).toString + (if (!row.isColDeterministic(i)) {"*"} else {""})
              }).toList
          )
  
       // println("RESULTS: "+list)
        if(i < 100) data.append((list, row.isDeterministic()))
        i = i + 1
      }
  
      val executionTime = (System.nanoTime() - startTime) / (1 * 1000 * 1000)
      new WebIterator(headers, data.toList, i, false, executionTime)
    })
  }
  
}
