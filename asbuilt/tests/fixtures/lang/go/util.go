package svc

func Helper() int {
	inner := func() int { return 1 }
	return inner()
}
