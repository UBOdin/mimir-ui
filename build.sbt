name := "mimirwebapp"

version := "0.2"

scalaVersion := "2.11.11"

lazy val mimircore = project

lazy val mimirwebapp = 
  project.in(file(".")).
    enablePlugins(play.PlayScala)

libraryDependencies ++= Seq(
  jdbc,
  cache,
  ws,
  specs2 % Test,
  "info.mimirdb" %% "mimir-core" % "0.2",
  "info.mimirdb" % "jsqlparser" % "1.0.2"
)

unmanagedResourceDirectories in Compile += baseDirectory.value / "lib_extra"
includeFilter in (Compile, unmanagedResourceDirectories):= ".dylib,.dll,.so"
unmanagedClasspath in Runtime += baseDirectory.value / "conf"
unmanagedResourceDirectories in Test += baseDirectory.value / "conf"

resolvers += "Local Maven Repository" at "file://"+Path.userHome.absolutePath+"/.m2/repository"
resolvers += Resolver.mavenLocal
resolvers += "scalaz-bintray" at "http://dl.bintray.com/scalaz/releases"
resolvers += "MimirDB" at "http://maven.mimirdb.info/"

// Play provides two styles of routers, one expects its actions to be injected, the
// other, legacy style, accesses its actions statically.
routesGenerator := InjectedRoutesGenerator

// logging
javaOptions in Test += "-Dlogger.file=conf/logback.xml"
