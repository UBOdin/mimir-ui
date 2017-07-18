package mimir.algebra

import mimir.Database
import mimir.web.OperatorNode
import mimir.ctables.CTables
import mimir.optimizer.ResolveViews

object QueryVisualizer {
  def convertToTree(op: Operator): OperatorNode = 
  {
    op match {
      case Project(cols, source) => {
        val projArg = cols.filter { case ProjectArg(col, exp) => CTables.isProbabilistic(exp) }
        if(projArg.isEmpty)
          convertToTree(source)
        else {
          var params = 
            projArg.flatMap( projectArg => CTables.getVGTerms(projectArg.expression) ).
                    map(_.name.replaceAll(":.*", "")) 
          if(params.isEmpty) {
            convertToTree(source)
          } else {
            params.toSet.foldLeft(
              convertToTree(source)
            )( (old, curr) => 
              new OperatorNode(curr, List(old), Some(curr))
            )
          }
        }
      }
      case Select(cond, Join(lhs, rhs)) => new OperatorNode("Join", List(convertToTree(lhs), convertToTree(rhs)), None)
      case Select(cond, source) => new OperatorNode("Filter", List(convertToTree(source)), None)
      case Join(lhs, rhs) => new OperatorNode("Join", List(convertToTree(lhs), convertToTree(rhs)), None)
      case Union(lhs, rhs) => new OperatorNode("Union", List(convertToTree(lhs), convertToTree(rhs)), None)
      case Table(name, alias, schema, metadata) => new OperatorNode(name, List[OperatorNode](), None)
      case o: Operator => new OperatorNode(o.getClass.toString, o.children.map(convertToTree(_)), None)
    }
  }

  def convertToTree(db: Database, op: Operator): OperatorNode = 
  {
    convertToTree(ResolveViews(db, op))
  }
}