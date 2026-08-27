EstudaFatec.com

A study platform for the FATEC entrance exam: past papers turned into a
filterable question bank, timed mock exams, and stats that tell you which
subject is actually costing you points.

Next.js full stack with the business logic kept out of the route handlers, and
two databases because questions and accounts do not want the same shape:
Postgres for users, sessions and answers, MongoDB for the questions.

The tests talk to real databases. Nothing about a database is worth mocking.
