package svc

const MaxConn = 10

var debugMode = false

type Server struct {
	Port int
}

type Handler interface {
	Serve() error
}

func NewServer(p int) *Server {
	if err := validate(p); err != nil {
		return nil
	}
	return &Server{Port: p}
}

func (s *Server) Start() error {
	return validate(s.Port)
}

func validate(p int) error {
	return nil
}
